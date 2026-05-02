# ============================================================
# MediReport AI — Centralized Supabase Client
# File: backend/config/supabase_client.py
#
# SINGLE SOURCE OF TRUTH for all Supabase client instances.
# Uses service role key for backend operations.
# ============================================================

import logging
from typing import Any

from supabase import Client, create_client
from postgrest.exceptions import APIError as PostgrestAPIError
try:
    from storage3.utils import StorageApiError
except ImportError:
    # Fallback for newer supabase-py versions
    try:
        from storage3.exceptions import StorageApiError
    except ImportError:
        # Final fallback - define our own
        class StorageApiError(Exception):
            """Storage API error wrapper."""
            pass

from config.settings import settings

logger = logging.getLogger("medireport.supabase")


# ── Singleton Client Instance ────────────────────────────
# This is initialized once and reused throughout the application
# to avoid creating multiple client instances

_supabase_service_client: Client | None = None


def get_supabase_client() -> Client:
    """
    Get the singleton Supabase service role client.
    
    This client has full admin access to the database and should ONLY be used
    for backend server operations, never for client-side code.
    
    The client is cached after first creation for performance.
    
    Returns:
        Client: Supabase client with service role key
        
    Raises:
        RuntimeError: If Supabase client cannot be created
    """
    global _supabase_service_client
    
    if _supabase_service_client is None:
        try:
            logger.info("Initializing Supabase service client...")
            
            _supabase_service_client = create_client(
                supabase_url=settings.supabase_url_str,
                supabase_key=settings.supabase_service_key,
            )
            
            logger.info("Supabase service client initialized successfully")
            
        except Exception as exc:
            logger.error("Failed to initialize Supabase client: %s", exc, exc_info=True)
            raise RuntimeError(f"Supabase client initialization failed: {exc}") from exc
    
    return _supabase_service_client


def reset_supabase_client() -> None:
    """
    Reset the singleton client. Useful for testing or error recovery.
    Next call to get_supabase_client() will create a fresh instance.
    """
    global _supabase_service_client
    _supabase_service_client = None
    logger.info("Supabase client reset")


# ── Helper Functions with Error Handling ─────────────────

async def safe_db_query(
    table: str,
    operation: str = "select",
    **kwargs: Any,
) -> dict[str, Any]:
    """
    Execute a database query with proper error handling.
    
    Args:
        table: Table name
        operation: Query operation (select, insert, update, delete, upsert)
        **kwargs: Query parameters
        
    Returns:
        Query result data
        
    Raises:
        PostgrestAPIError: On database errors (will be logged)
    """
    client = get_supabase_client()
    query_builder = client.table(table)
    
    try:
        if operation == "select":
            result = query_builder.select(kwargs.get("columns", "*"))
            if "eq" in kwargs:
                result = result.eq(kwargs["eq"]["column"], kwargs["eq"]["value"])
            if "order" in kwargs:
                result = result.order(kwargs["order"]["column"], desc=kwargs["order"].get("desc", False))
            if "limit" in kwargs:
                result = result.limit(kwargs["limit"])
            return result.execute().data
            
        elif operation == "insert":
            data = kwargs.get("data", {})
            return query_builder.insert(data).execute().data
            
        elif operation == "update":
            data = kwargs.get("data", {})
            query = query_builder.update(data)
            if "eq" in kwargs:
                query = query.eq(kwargs["eq"]["column"], kwargs["eq"]["value"])
            return query.execute().data
            
        elif operation == "delete":
            query = query_builder.delete()
            if "eq" in kwargs:
                query = query.eq(kwargs["eq"]["column"], kwargs["eq"]["value"])
            return query.execute().data
            
        elif operation == "upsert":
            data = kwargs.get("data", {})
            return query_builder.upsert(data).execute().data
            
        else:
            raise ValueError(f"Unknown operation: {operation}")
            
    except PostgrestAPIError as exc:
        logger.error(
            "Database query failed | table=%s operation=%s error=%s",
            table, operation, exc,
            exc_info=True,
        )
        raise


async def safe_storage_upload(
    bucket: str,
    path: str,
    file_data: bytes,
    content_type: str,
) -> str:
    """
    Upload file to Supabase Storage with error handling.
    
    Args:
        bucket: Storage bucket name
        path: File path in bucket
        file_data: Raw file bytes
        content_type: MIME type
        
    Returns:
        Public URL of uploaded file
        
    Raises:
        StorageApiError: On storage errors
    """
    client = get_supabase_client()
    
    try:
        # Upload file
        result = client.storage.from_(bucket).upload(
            path=path,
            file=file_data,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        
        # Get public URL
        public_url = client.storage.from_(bucket).get_public_url(path)
        
        logger.info(
            "Storage upload successful | bucket=%s path=%s size=%d bytes",
            bucket, path, len(file_data)
        )
        
        return public_url
        
    except StorageApiError as exc:
        error_msg = str(exc)
        # If bucket not found, try to create it
        if "Bucket not found" in error_msg or "404" in error_msg:
            logger.warning(f"Bucket '{bucket}' not found, attempting to create...")
            try:
                # Create bucket if it doesn't exist
                client.storage.create_bucket(
                    bucket,
                    options={"public": False}  # Private bucket
                )
                logger.info(f"Bucket '{bucket}' created successfully")
                
                # Retry upload after creating bucket
                result = client.storage.from_(bucket).upload(
                    path=path,
                    file=file_data,
                    file_options={"content-type": content_type, "upsert": "false"},
                )
                public_url = client.storage.from_(bucket).get_public_url(path)
                logger.info(
                    "Storage upload successful after bucket creation | bucket=%s path=%s",
                    bucket, path
                )
                return public_url
            except Exception as create_exc:
                logger.error(
                    "Failed to create bucket or retry upload | bucket=%s error=%s",
                    bucket, create_exc,
                    exc_info=True,
                )
        
        logger.error(
            "Storage upload failed | bucket=%s path=%s error=%s",
            bucket, path, exc,
            exc_info=True,
        )
        raise


async def safe_storage_delete(bucket: str, path: str) -> bool:
    """
    Delete file from Supabase Storage with error handling.
    
    Args:
        bucket: Storage bucket name
        path: File path in bucket
        
    Returns:
        True if deleted, False if file not found
    """
    client = get_supabase_client()
    
    try:
        client.storage.from_(bucket).remove([path])
        logger.info("Storage delete successful | bucket=%s path=%s", bucket, path)
        return True
        
    except StorageApiError as exc:
        if "not found" in str(exc).lower() or "404" in str(exc):
            logger.warning("Storage file not found for deletion | bucket=%s path=%s", bucket, path)
            return False
            
        logger.error(
            "Storage delete failed | bucket=%s path=%s error=%s",
            bucket, path, exc,
            exc_info=True,
        )
        raise


# ── Convenience Exports ───────────────────────────────────

__all__ = [
    "get_supabase_client",
    "reset_supabase_client",
    "safe_db_query",
    "safe_storage_upload",
    "safe_storage_delete",
]

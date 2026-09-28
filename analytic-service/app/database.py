from pymongo import AsyncMongoClient

from .config import settings


mondodb_client = AsyncMongoClient(settings.mongodb_url)
events_collection = mondodb_client[settings.mongodb_database][settings.mongodb_collection]

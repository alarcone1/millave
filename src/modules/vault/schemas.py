from pydantic import BaseModel
from datetime import datetime


class EntryListItem(BaseModel):
    id: str
    title: str
    username: str | None = None
    url: str | None = None
    account_status: str = "active"
    category_id: str | None = None
    category_name: str | None = None
    category_color: str | None = None


class EntryDetail(BaseModel):
    id: str
    title: str
    username: str | None = None
    password: str
    url: str | None = None
    totp_secret: str | None = None
    notes: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    category_color: str | None = None
    icon_color: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    support_contact: str | None = None
    account_status: str = "active"


class EntryListResponse(BaseModel):
    entries: list[EntryListItem]


class SearchResponse(BaseModel):
    results: list[EntryListItem]
    count: int

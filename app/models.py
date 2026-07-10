from sqlalchemy import Column,Integer,String,DateTime,ForeignKey,func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped,mapped_column,relationship
from datetime import datetime,timezone
from app.database import Base
from typing import Any

class Dataset(Base):
    __tablename__="datasets"

    id:Mapped[int] = mapped_column(primary_key=True,index=True)
    name:Mapped[str] = mapped_column(nullable=False)
    uploaded_at:Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
        )
    row_count:Mapped[int] = mapped_column(nullable=False)
    columns: Mapped[dict[str, Any]] = mapped_column(JSONB,nullable=False)

    records = relationship("Record",back_populates="dataset",cascade="all, delete")

class Record(Base):
    __tablename__="records"

    id:Mapped[int]=mapped_column(primary_key=True,index=True)
    dataset_id:Mapped[int]=mapped_column(ForeignKey("datasets.id"),nullable=False)
    data:Mapped[dict[str,Any]]=mapped_column(JSONB,nullable=False)

    dataset = relationship("Dataset",back_populates="records")
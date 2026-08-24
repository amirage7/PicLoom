from datetime import datetime

from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from app.db.session import build_session_factory
from app.models.entities import Base, Project, Prompt


PROJECT_SEEDS = (
    ("future-city", "未来城市设计", "2026-08-18T09:00:00+08:00"),
    ("product-concepts", "产品概念图", "2026-08-19T09:00:00+08:00"),
    ("architecture", "建筑渲染", "2026-08-20T09:00:00+08:00"),
)

PROMPT_SEEDS = (
    ("editorial-photo", "编辑感产品摄影", "Editorial product photography, controlled soft light, honest materials, restrained composition", "摄影", "2026-08-20T10:00:00+08:00"),
    ("industrial-object", "精密工业产品", "Precision industrial design object, machined aluminum, functional details, neutral studio", "产品设计", "2026-08-19T16:20:00+08:00"),
    ("quiet-architecture", "静谧建筑空间", "Quiet contemporary architecture, tactile concrete, diffused daylight, human scale", "建筑", "2026-08-18T08:40:00+08:00"),
    ("character-study", "自然人物肖像", "Natural character portrait, subtle expression, soft directional light, true skin texture", "人物", "2026-08-17T13:05:00+08:00"),
    ("cinematic-night", "电影夜景", "Cinematic night scene, motivated practical lighting, deep blacks, restrained color separation", "电影感", "2026-08-16T20:15:00+08:00"),
    ("editorial-illustration", "现代编辑插画", "Contemporary editorial illustration, confident shapes, limited palette, tactile print texture", "插画", "2026-08-15T09:25:00+08:00"),
)


def seed_database(session: Session) -> None:
    if session.scalar(select(func.count()).select_from(Project)) == 0:
        session.add_all([Project(id=id_, name=name, created_time=datetime.fromisoformat(created)) for id_, name, created in PROJECT_SEEDS])
    if session.scalar(select(func.count()).select_from(Prompt)) == 0:
        session.add_all([Prompt(id=id_, title=title, content=content, category=category, created_time=datetime.fromisoformat(created)) for id_, title, content, category, created in PROMPT_SEEDS])
    session.commit()


def init_database(engine: Engine) -> None:
    Base.metadata.create_all(engine)
    with build_session_factory(engine)() as session:
        seed_database(session)

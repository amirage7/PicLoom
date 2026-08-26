from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.schemas.images import ImageRelationCreate, ImageRelationResponse, ImageResponse, ImageUpdate
from app.services import image_relations, image_resources
from app.services.image_names import ImageNameConflictError, ImageNameValidationError
from app.services.image_storage import ImageStorageError, MAX_IMAGE_BYTES
from app.services.resources import ResourceNotFoundError


router = APIRouter(tags=["images"])


def translate_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, ImageRelationshipError):
        return HTTPException(status_code=400, detail=str(error))
    if isinstance(error, ImageNameConflictError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, ImageNameValidationError):
        return HTTPException(status_code=422, detail=str(error))
    if isinstance(error, ImageStorageError):
        return HTTPException(status_code=error.status_code, detail=str(error))
    return HTTPException(status_code=500, detail="图片操作失败")


ImageRelationshipError = image_resources.ImageRelationshipError


@router.get("/projects/{project_id}/images", response_model=list[ImageResponse])
def get_images(project_id: str, session: Session = Depends(get_session)):
    try:
        return image_resources.list_images(session, project_id)
    except ResourceNotFoundError as error:
        raise translate_error(error) from error


@router.get("/unarchived/images", response_model=list[ImageResponse])
def get_unarchived_images(session: Session = Depends(get_session)):
    return image_resources.list_unarchived_images(session)


@router.post("/image-relations", response_model=ImageRelationResponse)
def post_image_relation(payload: ImageRelationCreate, session: Session = Depends(get_session)):
    try:
        relation = image_relations.create_relation(
            session, payload.source_id, payload.target_id
        )
        return image_relations.serialize_relation(relation)
    except (ResourceNotFoundError, ImageRelationshipError) as error:
        raise translate_error(error) from error


@router.delete(
    "/image-relations/{source_id}/{target_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_image_relation(
    source_id: str,
    target_id: str,
    session: Session = Depends(get_session),
) -> Response:
    image_relations.delete_relation(session, source_id, target_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{project_id}/images", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
async def post_image(
    request: Request,
    project_id: str,
    file: UploadFile = File(...),
    prompt: str = Form(""),
    parent_id: str | None = Form(None),
    position_x: float = Form(0),
    position_y: float = Form(0),
    session: Session = Depends(get_session),
):
    content = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        return image_resources.create_image(session, request.app.state.settings.data_dir, project_id, content, file.filename or "image", prompt, position_x, position_y, parent_id)
    except (ResourceNotFoundError, ImageRelationshipError, ImageStorageError) as error:
        raise translate_error(error) from error


@router.post("/unarchived/images", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
async def post_unarchived_image(
    request: Request,
    file: UploadFile = File(...),
    prompt: str = Form(""),
    session: Session = Depends(get_session),
):
    content = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        return image_resources.create_image(
            session, request.app.state.settings.data_dir, None, content,
            file.filename or "image", prompt, 0, 0, None,
        )
    except (ImageStorageError, ImageRelationshipError) as error:
        raise translate_error(error) from error


@router.get("/images/{image_id}/content", response_class=FileResponse)
def get_image_content(request: Request, image_id: str, session: Session = Depends(get_session)):
    try:
        path, file_name = image_resources.get_image_file(session, request.app.state.settings.data_dir, image_id)
        return FileResponse(path, filename=file_name)
    except (ResourceNotFoundError, ImageStorageError) as error:
        raise translate_error(error) from error


@router.patch("/images/{image_id}", response_model=ImageResponse)
def patch_image(request: Request, image_id: str, payload: ImageUpdate, session: Session = Depends(get_session)):
    try:
        session.info["data_dir"] = request.app.state.settings.data_dir
        return image_resources.update_image(session, image_id, payload)
    except (ResourceNotFoundError, ImageRelationshipError, ImageNameConflictError, ImageNameValidationError) as error:
        raise translate_error(error) from error


@router.post("/images/{image_id}/duplicate", response_model=ImageResponse, status_code=status.HTTP_201_CREATED)
def duplicate_image(request: Request, image_id: str, session: Session = Depends(get_session)):
    try:
        return image_resources.copy_image(session, request.app.state.settings.data_dir, image_id)
    except (ResourceNotFoundError, ImageStorageError) as error:
        raise translate_error(error) from error


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_image(request: Request, image_id: str, session: Session = Depends(get_session)) -> Response:
    try:
        image_resources.delete_image(session, request.app.state.settings.data_dir, image_id)
    except (ResourceNotFoundError, ImageStorageError) as error:
        raise translate_error(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)

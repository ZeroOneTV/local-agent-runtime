FROM python:3.11-slim

# Pacotes de idioma do Tesseract instalados na imagem.
# Default = português + inglês. Para suportar outros idiomas em MEDIA_OCR_LANGUAGES,
# adicione os pacotes aqui (ex.: "tesseract-ocr-spa tesseract-ocr-fra").
ARG TESSERACT_LANG_PACKS="tesseract-ocr-por tesseract-ocr-eng"

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    ${TESSERACT_LANG_PACKS} \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-base.txt .
RUN pip install --no-cache-dir -r requirements-base.txt

ARG INSTALL_OCR=false
COPY requirements-ocr.txt .
RUN if [ "$INSTALL_OCR" = "true" ]; then pip install --no-cache-dir -r requirements-ocr.txt; fi

ARG INSTALL_DOCLING=false
COPY requirements-docling.txt .
RUN if [ "$INSTALL_DOCLING" = "true" ]; then pip install --no-cache-dir -r requirements-docling.txt; fi

ARG INSTALL_VISION=false
COPY requirements-vision.txt .
RUN if [ "$INSTALL_VISION" = "true" ]; then pip install --no-cache-dir -r requirements-vision.txt; fi

COPY app ./app

ENV STORAGE_ROOT=/storage/media
ENV PORT=5000

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]

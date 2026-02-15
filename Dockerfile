FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir yt-dlp yt-dlp-ejs

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

RUN echo '--js-runtimes bun' > /etc/yt-dlp.conf

RUN ffmpeg -version
RUN ffprobe -version
RUN yt-dlp --version
RUN bun --version

COPY bun.lock package.json ./
RUN bun install

COPY src ./src

CMD ["bun", "run", "start"]

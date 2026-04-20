FROM debian:trixie-slim

ARG UID=1000
ARG GID=1000

RUN apt-get update && apt-get install -y --no-install-recommends \
        gjs \
        libglib2.0-bin \
        libglib2.0-dev-bin \
        gettext \
        make \
        zip \
        git \
        jq \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g ${GID} dev && useradd -m -u ${UID} -g ${GID} -s /bin/bash dev

USER dev
WORKDIR /workspace

CMD ["bash"]

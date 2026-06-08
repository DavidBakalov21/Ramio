FROM gcc:14-bookworm

RUN useradd -m -u 10001 runner
WORKDIR /workspace
USER runner

CMD ["g++", "--version"]

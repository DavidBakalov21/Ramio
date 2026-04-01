FROM eclipse-temurin:21-jdk

RUN useradd -m -u 10001 runner
WORKDIR /workspace
USER runner

CMD ["java", "-version"]

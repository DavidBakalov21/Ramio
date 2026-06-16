FROM public.ecr.aws/lambda/nodejs:22

RUN dnf install -y git && dnf clean all

COPY package.json package-lock.json index.mjs ./
RUN npm ci --omit=dev

CMD ["index.handler"]

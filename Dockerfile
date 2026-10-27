FROM hsldevcom/base/node:22 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN npm run check-and-build

FROM build AS tester
CMD ["npm", "run", "check-and-build"]

FROM hsldevcom/base/node:22 AS production

WORKDIR /app
ENV NODE_ENV=production
VOLUME /hostpipe
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src ./src

CMD ["npm", "start"]
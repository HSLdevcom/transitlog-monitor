FROM hsldevcom/infodevops-docker-base-images:22-node-edge AS build

WORKDIR /opt/transitlog-monitor

COPY package.json package-lock.json ./
RUN npm ci

ARG BUILD_ENV=production
COPY .env.${BUILD_ENV} .env.production
COPY constants.js reporter.js schedule.js server.js ./
RUN npm test && npm prune --omit=dev

FROM hsldevcom/infodevops-docker-base-images:22-node-edge AS production

ENV NODE_ENV=production
WORKDIR /opt/transitlog-monitor
VOLUME /hostpipe

COPY --from=build /opt/transitlog-monitor/node_modules ./node_modules
COPY --from=build /opt/transitlog-monitor/package.json ./package.json
COPY --from=build /opt/transitlog-monitor/.env.production ./.env.production
COPY --from=build /opt/transitlog-monitor/constants.js ./constants.js
COPY --from=build /opt/transitlog-monitor/reporter.js ./reporter.js
COPY --from=build /opt/transitlog-monitor/schedule.js ./schedule.js
COPY --from=build /opt/transitlog-monitor/server.js ./server.js

CMD ["npm", "start"]

#!/bin/bash
set -e

ORG=${ORG:-hsldevcom}

read -p "Tag: " TAG

DOCKER_TAG=${TAG:-latest}
DOCKER_IMAGE=$ORG/transitlog-monitor:${DOCKER_TAG}

docker build --build-arg BUILD_ENV=${TAG:-latest} -t $DOCKER_IMAGE .
docker push $DOCKER_IMAGE

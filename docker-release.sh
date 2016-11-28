#!/bin/bash

if [ -f ".env" ]; then
  source ".env";
fi

BUILD_ENV=${ENVS:-production}
NPM_PROXY=${NPM_PROXY:-https://registry.npmjs.com}

make ENVS="$BUILD_ENV" NPM_PROXY=$NPM_PROXY build push

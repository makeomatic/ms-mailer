SHELL := /bin/bash
NODE_VERSIONS := 5.1.1
DOCKER_ORG := makeomatic
PKG_NAME := $(shell cat package.json | ./node_modules/.bin/json name)
PKG_VERSION := $(shell cat package.json | ./node_modules/.bin/json version)
TAG_BASE := $(DOCKER_ORG)/$(PKG_NAME)

# define task lists
TEST_TASKS := $(addsuffix .test, $(NODE_VERSIONS))
BUILD_TASKS := $(addsuffix .build, $(NODE_VERSIONS))
PUSH_TASKS := $(addsuffix .push, $(NODE_VERSIONS))

test: $(TEST_TASKS)

build: $(BUILD_TASKS)

push: $(PUSH_TASKS)

$(TEST_TASKS):
	docker run -d --name=rabbitmq rabbitmq; \
	docker run --link=rabbitmq -v ${PWD}:/usr/src/app -w /usr/src/app --rm -e NODE_ENV=docker node:5.0.0 npm test; \
	EXIT_CODE=$$?; \
	docker rm -f rabbitmq; \
	exit ${EXIT_CODE};

$(BUILD_TASKS):
	npm run prepublish
	docker build --build-arg VERSION=v$(basename $@) --build-arg NODE_ENV=development -t $(TAG_BASE):$(basename $@)-development .
	docker build --build-arg VERSION=v$(basename $@) -t $(TAG_BASE):$(basename $@)-$(PKG_VERSION) .
	docker tag -f $(TAG_BASE):$(basename $@)-$(PKG_VERSION) $(TAG_BASE):$(basename $@)

$(PUSH_TASKS):
	docker push $(TAG_BASE):$(basename $@)-development
	docker push $(TAG_BASE):$(basename $@)-$(PKG_VERSION)
	docker push $(TAG_BASE):$(basename $@)

.PHONY: test build push

SHELL := /bin/bash
NODE_VERSIONS := 5.0.0 4.2.2 0.12.7
PKG_VERSION := $(cat package.json | ./node_modules/.bin/json version)

# define task lists
TEST_TASKS := $(addsuffix .test, $(NODE_VERSIONS))
BUILD_TASKS := $(addsuffix .build, $(NODE_VERSIONS))
PUSH_TASKS := $(addsuffix .push, $(NODE_VERSIONS))

test: $(TEST_TASKS)

build: $(BUILD_TASKS)

push: $(PUSH_TASKS)

$(TEST_TASKS):
	docker run -d --name=rabbitmq rabbitmq; \
	docker run --link=rabbitmq -v ${PWD}:/usr/src/app -w /usr/src/app --rm -e TEST_ENV=docker node:$(basename $@) npm test; \
	EXIT_CODE=$?; \
	docker rm -f rabbitmq; \
	exit ${EXIT_CODE};

$(BUILD_TASKS):
	npm run prepublish
	docker build --build-arg VERSION=v$(basename $@) -t makeomatic/ms-mailer:$(basename $@)-$(PKG_VERSION) .
	docker tag -f makeomatic/ms-mailer:$(basename $@)-$(PKG_VERSION) makeomatic/ms-mailer:$(basename $@)

$(PUSH_TASKS):
	docker push makeomatic/ms-mailer:$(basename $@)-$(PKG_VERSION) makeomatic/ms-mailer:$(basename $@)

.PHONY: test build push
SHELL := /bin/bash
NODE_VERSIONS := 5.0.0 4.2.2 0.12.7

test: $(addsuffix .test, $(NODE_VERSIONS))

build: $(addsuffix .build, $(NODE_VERSIONS))

$(addsuffix .test, $(NODE_VERSIONS)):
	docker run -d --name=rabbitmq rabbitmq; \
	docker run --link=rabbitmq -v ${PWD}:/usr/src/app -w /usr/src/app --rm -e TEST_ENV=docker node:$(basename $@) npm test; \
	EXIT_CODE=$?; \
	docker rm -f rabbitmq; \
	exit ${EXIT_CODE};

$(addsuffix .build, $(NODE_VERSIONS)):
	npm run prepublish && \
	docker build --build-arg VERSION=v$(basename $@) -t makeomatic/ms-mailer:$(basename $@) .

.PHONY: test build
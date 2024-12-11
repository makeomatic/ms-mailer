module.exports = {
  node: "20",
  auto_compose: true,
  services: [
    "rabbitmq"
  ],
  extras: {
    tester: {
      environment: {
        NODE_NO_WARNINGS: '1'
      }
    }
  }
}

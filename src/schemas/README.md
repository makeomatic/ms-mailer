# Validation schemas

Generally we have 3 validation schemas:

1. email
2. credentials
3. configuration

The most detailed ones are credentials and email, while configuration focuses on the module configuration validation.
Remote schemas are not used, because they are not well handled by the underlaying module and the error messages look cryptic (ie, remote schema validation failed).
Therefore there is a lot of copy paste, but that's just for usefulness of messages. There is room for improvement (better key-specifc validations), sanity of input
values and not just the type, etc.

PRs are welcome.

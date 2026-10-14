// One error type for everything the API reports on purpose. The JSON body is
// always { error: { code, message, fields? } } so the browser side can show
// `message` in a live region and `fields` next to the matching inputs.
class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  toJSON() {
    const body = { code: this.code, message: this.message };
    if (this.fields) body.fields = this.fields;
    return { error: body };
  }
}

const notFound = () =>
  new AppError(404, 'not_found', 'We could not find that issue. It may not exist or it may belong to someone else.');

module.exports = { AppError, notFound };

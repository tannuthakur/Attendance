export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'You do not have permission to perform this action') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = 'Please sign in') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

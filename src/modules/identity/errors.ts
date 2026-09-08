class IdentityError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export class UnauthenticatedError extends IdentityError {
  constructor(message = "Unauthenticated") {
    super("UnauthenticatedError", message);
  }
}

export class ForbiddenError extends IdentityError {
  constructor(message = "Forbidden") {
    super("ForbiddenError", message);
  }
}

export class NotFoundError extends IdentityError {
  constructor(message = "Not found") {
    super("NotFoundError", message);
  }
}

export class ConflictError extends IdentityError {
  constructor(message = "Conflict") {
    super("ConflictError", message);
  }
}

export class DatabaseUnavailableError extends Error {
  constructor(message = "Application database is unavailable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

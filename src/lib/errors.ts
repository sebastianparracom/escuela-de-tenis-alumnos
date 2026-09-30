/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}

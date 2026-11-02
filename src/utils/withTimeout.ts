/**
 * Utilidad de robustez: envuelve una promesa con un tiempo máximo de espera.
 *
 * Objetivo: que ninguna operación del módulo IN/OUT pueda quedar esperando
 * indefinidamente (red mala, imagen que no se puede decodificar, SMTP colgado).
 * Al vencer el tiempo, la promesa rechaza con TimeoutError y la UI puede
 * mostrar un error accionable en lugar de un spinner eterno.
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  input: PromiseLike<T>,
  ms: number,
  message = 'La operación tardó demasiado.'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });

  // Promise.race ya adjunta manejadores a ambas promesas, así que un rechazo
  // tardío de `input` después del timeout no genera unhandled rejection.
  return Promise.race([Promise.resolve(input), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export function isTimeoutError(err: unknown): err is TimeoutError {
  return err instanceof TimeoutError;
}
// Fecha de "hoy" en hora de México (UTC−6) como 'YYYY-MM-DD'.
//
// NO usar `new Date().toISOString().slice(0,10)` directo: toISOString() da UTC,
// así que después de las 6 pm de México ya es el día siguiente y la fecha sale
// corrida (un movimiento capturado el 18 por la noche quedaba con fecha 19).
// México (centro) es UTC−6 fijo (sin horario de verano desde 2023).
export function hoyMX(): string {
  return new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10)
}

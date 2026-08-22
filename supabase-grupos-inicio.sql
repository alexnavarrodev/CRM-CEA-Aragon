-- Inicio de clases por grupo: para que las cuadrículas de Colegiaturas y Bachillerato
-- oculten automáticamente los meses anteriores al arranque de cada grupo (ya no hace
-- falta marcar manualmente "$0/Pagado" mes por mes cuando se abre un grupo nuevo).
-- Corrido en Aragón el 22 ago 2026 vía Management API. Falta portar a Atenea.
alter table grupos add column if not exists anio_inicio integer;
alter table grupos add column if not exists mes_inicio integer;

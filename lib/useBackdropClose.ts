'use client'
import { useRef } from 'react'

// Cierra el modal solo si el mousedown Y el click cayeron sobre el fondo (backdrop) mismo.
// Evita que arrastrar el mouse para seleccionar texto en un input y soltar fuera del modal
// lo cierre por accidente.
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false)
  return {
    onMouseDown: (e: React.MouseEvent) => { downOnBackdrop.current = e.target === e.currentTarget },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
    },
  }
}

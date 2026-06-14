'use client'

import { Settings } from 'lucide-react'

export default function AjustesPage() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">Ajustes</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-lg">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Información de la escuela</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre de la escuela</label>
                  <input
                    defaultValue="CEA Aragón — Escuela de Enfermería"
                    readOnly
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-500"
                  />
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">Más opciones de configuración próximamente.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

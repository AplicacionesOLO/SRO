
// ⚠️ DEPRECATED (v628) - El sistema ahora usa SMTP centralizado.
// Este guard ya no es necesario. Se mantiene temporalmente para no romper imports.
// Plan: eliminar completamente en próxima limpieza.

interface GmailConnectionGuardProps {
  orgId: string | null;
  ready: boolean;
}

export function GmailConnectionGuard(_props: GmailConnectionGuardProps) {
  return null;
}

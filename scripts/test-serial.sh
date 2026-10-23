#!/usr/bin/env bash
# Verrou machine pour les tests du chantier POS (frontend/docs/chantiers/pos_mvp/PLAN.md §6).
# Un seul jest à la fois sur la machine, tous agents et worktrees confondus, un seul fichier
# spec par appel, toujours en --runInBand : plusieurs jest en parallèle ont déjà planté la
# machine (02/10 et 06/10).
#
# Usage : scripts/test-serial.sh backend src/features/pos/pos-sale.service.spec.ts
#         scripts/test-serial.sh frontend tests/unit/posCart.spec.js
# Le test ne démarre que si plus de MIN_FREE_MB (1024 par défaut) de RAM sont disponibles.
# Les tests légers (hors jest/vue-cli-service) n'ont pas besoin de ce script.
# Le chemin du fichier est relatif au dossier backend/ ou frontend/ du worktree courant.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage : $0 <backend|frontend> <un fichier spec>" >&2
  exit 2
fi

target="$1"
spec="$2"
case "$target" in
  backend|frontend) ;;
  *) echo "Cible inconnue : $target (backend ou frontend)" >&2; exit 2 ;;
esac

case "$spec" in
  *.spec.ts|*.spec.js|*.test.ts|*.test.js) ;;
  *) echo "Un seul fichier spec attendu, pas un dossier ni un motif : $spec" >&2; exit 2 ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/$target"
if [ ! -f "$dir/$spec" ]; then
  echo "Fichier introuvable : $dir/$spec" >&2
  exit 2
fi

lock="/tmp/datafriday-jest.lock"
waited=0
until mkdir "$lock" 2>/dev/null; do
  if [ "$waited" -eq 0 ]; then
    echo "Un autre jest tourne (verrou $lock, détenu par : $(cat "$lock/owner" 2>/dev/null || echo inconnu)). Attente..."
  fi
  waited=$((waited + 2))
  # Verrou orphelin (processus mort) : libéré après vérification du PID.
  owner_pid="$(cut -d' ' -f1 "$lock/owner" 2>/dev/null || true)"
  if [ -n "$owner_pid" ] && ! kill -0 "$owner_pid" 2>/dev/null; then
    echo "Verrou orphelin (PID $owner_pid absent), libération."
    rm -rf "$lock"
    continue
  fi
  sleep 2
done
echo "$$ $target $spec" > "$lock/owner"
trap 'rm -rf "$lock"' EXIT INT TERM

# RAM disponible (Mo) sous macOS : pages libres + inactives + spéculatives + purgeables.
available_mb() {
  vm_stat | awk '
    /page size of/ { gsub(/[^0-9]/, "", $8); ps = $8 }
    /^Pages free|^Pages inactive|^Pages speculative|^Pages purgeable/ { gsub(/\./, "", $NF); n += $NF }
    END { printf "%d", n * ps / 1048576 }'
}
min_free="${MIN_FREE_MB:-1024}"
ram_waited=0
while [ "$(available_mb)" -lt "$min_free" ]; do
  if [ "$ram_waited" -eq 0 ]; then
    echo "RAM disponible $(available_mb) Mo < ${min_free} Mo, attente avant de lancer le test lourd..."
  fi
  ram_waited=$((ram_waited + 5))
  if [ "$ram_waited" -ge 600 ]; then
    echo "RAM toujours insuffisante après 10 min, abandon (libérez de la mémoire puis relancez)." >&2
    exit 3
  fi
  sleep 5
done

cd "$dir"
if [ "$target" = "backend" ]; then
  npx jest --runInBand "$spec"
else
  npx vue-cli-service test:unit --runInBand "$spec"
fi

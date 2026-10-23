#!/usr/bin/env python3
"""Surveilleur de tokens des agents d'une session Claude Code.

Toutes les 20 s, lit la transcription de chaque sous-agent et calcule la taille de son
contexte (input + cache lus + cache créés du dernier message assistant). N'affiche une
ligne que quand un agent franchit un seuil :
  WARN  >= 130k : finir proprement, écrire le résumé de passation, ne rien démarrer de neuf
  STOP  >= 150k : arrêt immédiat, relais par un agent neuf avec le résumé

Usage : python3 scripts/agent-token-watch.py [session_id]
        (sans argument : la session la plus récemment modifiée du projet)
Lancé via Monitor, chaque ligne affichée devient une notification pour l'agent principal.
"""
import glob, json, os, sys, time

PROJECT = os.path.expanduser("~/.claude/projects/-Users-bigfiveabidjan-Projets-datafriday")
WARN, STOP, EVERY = 130_000, 150_000, 20


def session_dir():
    if len(sys.argv) > 1:
        return os.path.join(PROJECT, sys.argv[1])
    sessions = [p for p in glob.glob(os.path.join(PROJECT, "*.jsonl"))]
    return os.path.splitext(max(sessions, key=os.path.getmtime))[0]


def context_tokens(path):
    last = 0
    with open(path, errors="ignore") as f:
        for line in f:
            if '"usage"' not in line:
                continue
            try:
                u = json.loads(line).get("message", {}).get("usage")
            except ValueError:
                continue
            if u:
                last = (u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
                        + u.get("cache_creation_input_tokens", 0))
    return last


def main():
    root = session_dir()
    level = {}  # fichier -> 0 ok, 1 warn émis, 2 stop émis
    print(f"Surveillance de {root} (WARN {WARN // 1000}k, STOP {STOP // 1000}k, toutes les {EVERY}s)", flush=True)
    while True:
        files = glob.glob(os.path.join(root, "subagents", "*.jsonl")) + glob.glob(root + ".jsonl")
        for path in files:
            n = context_tokens(path)
            name = "principal" if path == root + ".jsonl" else os.path.basename(path)[:-6]
            new = 2 if n >= STOP else 1 if n >= WARN else 0
            if new > level.get(path, 0):
                print(f"{'STOP' if new == 2 else 'WARN'} {name} : {n // 1000}k tokens", flush=True)
            level[path] = max(level.get(path, 0), new)
        time.sleep(EVERY)


if __name__ == "__main__":
    main()

# Grimoire

**Problem:** Past incantations must stay one click away without unmounting the studio.

**Prototype:** [grimoire.html](grimoire.html)

## Layout

280px left rail. Search. Newest first. Empty: three starter incantation cards.

## States

| State | UI |
|---|---|
| Empty | Starter cards |
| Loading | Skeleton rows |
| Success | Clip list |
| Error | Couldn’t open Grimoire + retry |

# Grimoire

**Problem:** Past incantations must stay one click away on the Library tab.

**Prototype:** [grimoire.html](grimoire.html)

## Layout

Library tab. Search. Newest first in a card grid. Empty: three starter incantation cards. Choosing a page opens Generate.

## States

| State | UI |
|---|---|
| Empty | Starter cards |
| Loading | Skeleton rows |
| Success | Clip list |
| Error | Couldn’t open Grimoire + retry |

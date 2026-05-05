# Spousteni aplikace

V tehle slozce muzes pouzit dvojklikaci `.command` soubory.

## 1. Vzdy jako prvni

Spust:

```text
Start Backend.command
```

Nech okno bezet. Backend bezi na portu `8000`.

## 2. Vyber frontend

Pro browser na Macu:

```text
Start Mobile Web.command
```

Pro iOS Simulator / Xcode:

```text
Start Mobile Simulator.command
```

Pro fyzicky iPhone pres Expo Go:

```text
Start Mobile Phone.command
```

## Poznamky

- Pro web a simulator se backend vola pres `http://localhost:8000`.
- Pro fyzicky iPhone se backend vola pres LAN IP Macu, napr. `http://10.0.1.90:8000`.
- Kdyz frontend napise, ze backend neodpovida, zkontroluj, ze bezi `Start Backend.command`.
- Kdyz macOS pri prvnim spusteni blokuje `.command`, dej pravy klik -> Open.

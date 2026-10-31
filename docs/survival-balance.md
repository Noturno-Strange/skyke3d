# Modo Sobrevivência: números e o que cada um faz

Gerado por `node tools/survdoc.js` a partir de `SURV` em `assets/catalog.js` (não edite à mão; mude o catálogo e gere de novo).

## Área andável (`walk`)

Círculo onde dá para andar (o jogo normal usa 10,2 m). Precisa parar antes das montanhas (a 58 m do centro). `r` maior = mais caminhada entre a fogueira e a cisterna.

```json
{ "x": 0, "z": 1.2, "r": 28 }
```

## Zonas (`zones`)

Distância à fogueira: perto é seguro, longe tem os melhores recursos e mais frio. A última zona termina em `walk.r`.

```json
{ "perto": [ 0, 10 ], "meio": [ 10, 20 ], "longe": [ 20, 28 ] }
```

## Dia e noite (`time`)

Segundos de luz e de noite. A noite multiplica o desgaste (`nightX` de cada medidor e da fogueira).

```json
{ "day": 150, "night": 90 }
```

## Dificuldade crescente (`ramp`)

O fator multiplica o desgaste e o gasto da fogueira: começa em `from`, sobe até `to` (curva com constante de tempo `tau`). `step` = segundos por nível na tela. `resp` deixa os recursos mais lentos para voltar. Medir com `node tools/survsim.js`: bots perfeitos devem cair entre 30 e 40 min.

```json
{ "from": 0.45, "to": 2.2, "tau": 1800, "step": 300, "resp": 0.5 }
```

## Rodada (`run`)

`minPlayers` e `minSec`: o que conta para as estatísticas. `ref`: acima desse número de jogadores os recursos voltam mais rápido (ref/jogadores) para dar para todos.

```json
{ "minPlayers": 2, "minSec": 180, "ref": 3 }
```

## Medidores (`meters`)

`drain` = perda por segundo no fator 1; `nightX` = multiplicador à noite; `nearFire` = ganho de calor por segundo perto da fogueira acesa; `start` = valor inicial. Nenhum pode zerar antes do fim do primeiro dia.

```json
{ "calor": { "ic": "🔥", "n": "Calor", "max": 100, "start": 100, "drain": 0.25, "nightX": 4, "nearFire": 1.2 }, "fome": { "ic": "🍖", "n": "Fome", "max": 100, "start": 100, "drain": 0.35, "nightX": 1.2 }, "sede": { "ic": "💧", "n": "Sede", "max": 100, "start": 100, "drain": 0.5, "nightX": 1.2 } }
```

## Fogueira (`fire`)

`burn` = combustível por segundo (fator 1), `nightX` à noite, `heat` = alcance do calor (m), `relight` = o que reacende, `relightFuel` = combustível ao reacender. `x`/`z` = posição (centro do cenário).

```json
{ "x": 0, "z": 1.2, "max": 100, "start": 60, "burn": 0.6, "nightX": 2, "heat": 6, "relight": { "graveto": 3 }, "relightFuel": 20 }
```

## Desmaio e reanimação (`revive`)

`hold` = segundos segurando para reanimar, `radius` = alcance, `back` = valor de cada medidor ao ser reanimado, `auto`/`autoBack` = acordar sozinho (mais fraco que reanimado).

```json
{ "radius": 2.2, "hold": 3, "back": 30, "auto": 90, "autoBack": 15 }
```

## Enjoo (`sick`)

`dur` segundos; `drainX` multiplica o desgaste enquanto durar.

```json
{ "dur": 20, "drainX": 1.5 }
```

## Coleta (`coleta`)

`radius` = alcance (m) para coletar.

```json
{ "radius": 1.8 }
```

## Culinária (`cook`)

`radius` = alcance da fogueira para cozinhar, `burn` = segundos até o prato pronto queimar, `groupX`/`groupRadius` = bônus por comer perto de outro jogador.

```json
{ "radius": 3, "burn": 20, "groupX": 1.2, "groupRadius": 5 }
```

## Recursos de coleta (`res`)

`give` = quanto cada coleta rende; `respawn` = segundos para o ponto voltar (fator 1); `spots` = pontos por zona (sorteados pela semente); `fuel`/`fome`/`sede` = o que restaura.

| id | nome | tipo | rende | volta em (s) | pontos | efeito |
|---|---|---|---|---|---|---|
| lenha | 🪵 Lenha | fuel | 1 | 150 | {"perto":3,"meio":8,"longe":3} | fuel 25 |
| graveto | 🌿 Gravetos | fuel | 2 | 60 | {"meio":8,"longe":2} | fuel 8 |
| fruta | 🍎 Maçã | food | 1 | 120 | {"meio":6,"longe":2} | fome 10 |
| raiz | 🥔 Raiz | food | 1 | 120 | {"meio":6,"longe":2} | fome 8 |
| cogumelo | 🍄 Cogumelo | food | 1 | 150 | {"meio":3,"longe":3} | fome 6, sick 0.5 |
| agua | 💧 Água | drink | 1 | 90 | {"longe":5} | sede 35 |

## Receitas (`recipes`)

Cozinhar tem que valer mais que comer cru (um teste confere). `give` = porções.

| id | prato | ingredientes | tempo (s) | porções | efeito |
|---|---|---|---|---|---|
| fruta_assada | 🍎 Maçã assada | fruta | 6 | 1 | fome 22 |
| raiz_assada | 🥔 Raiz assada | raiz | 8 | 1 | fome 30 |
| cogumelo_assado | 🍄 Cogumelo assado | cogumelo | 6 | 1 | fome 20 |
| cha_fruta | 🍵 Chá de maçã | fruta + agua | 8 | 1 | sede 30, calor 25 |
| sopa | 🍲 Sopa rústica | raiz + cogumelo + agua | 12 | 2 | fome 45, sede 15 |

## Conquistas (`ach`)

`run: 1` = vale numa só rodada; senão soma todas. Cada uma libera um colecionável diferente.

| id | conquista | meta | contador | colecionável |
|---|---|---|---|---|
| chama | 🔥 Primeira chama | 1 | lit | 🪔 Lamparina |
| guardiao | 🔥 Guardião do fogo | 10 | lit | 🏮 Lanterna de papel |
| mestrefogo | 🌋 Mestre do fogo | 50 | lit | 🌟 Estrela de brasa |
| lenhador | 🪓 Lenhador | 100 | col.lenha | 🪓 Machadinha |
| maca25 | 🍏 Colhedor de maçãs | 25 | col.fruta | 🍏 Maçã verde |
| maca100 | 🧺 Pomar vivo | 100 | col.fruta | 🧺 Cesto de maçãs |
| macarun | 🍎 Colheita farta | 15 (numa rodada) | col.fruta | 🥇 Maçã dourada |
| aguadeiro | 🪣 Aguadeiro | 50 | col.agua | 🪣 Balde de cobre |
| cozinha1 | 🥄 Primeira refeição | 1 | cook | 🥄 Colher de pau |
| cozinha25 | 🍳 Cozinheiro | 25 | cook | 🍳 Frigideira |
| cozinha100 | 👨‍🍳 Chef do acampamento | 100 | cook | 🎩 Chapéu de chef |
| cozinharun | 🥘 Maratona na panela | 8 (numa rodada) | cook | 🥘 Panelão |
| sopa5 | 🍲 Sopeiro | 5 | cook.sopa | 🥣 Concha de sopa |
| cha5 | 🍵 Casa de chá | 5 | cook.cha_fruta | 🫖 Bule |
| raiz10 | 🥔 Assador de raízes | 10 | cook.raiz_assada | 🥕 Cenoura de ouro |
| anjo | 👼 Anjo da guarda | 5 | rev | 👼 Pena de anjo |
| maoaberta | 🎁 Mão aberta | 10 | give | 🎀 Laço dourado |
| tempo10 | 🏕 Sobreviventes | 600 (numa rodada) | time | ⛺ Barraca |
| tempo30 | 🏆 Veterano | 1800 (numa rodada) | time | 🏆 Troféu |

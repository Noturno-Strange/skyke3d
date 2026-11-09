# Auditoria e arquitetura da voz (v3.23.11)

Auditoria da implementação WSS + Opus feita em 2026-11-09, incluindo os limites de escalabilidade e as alterações para cumprir a conferência mono com até 40 participantes. Os números de banda abaixo são estimativas matemáticas, não medições de produção.

## Arquitetura recomendada

Manter o WSS como transporte principal e encaminhar os quadros Opus mono, sem decodificação, mixagem ou transcodificação no servidor. O navegador captura mono com `getUserMedia`, solicita AEC ao navegador, captura fora da linha de renderização 3D por AudioWorklet, codifica com WebCodecs AudioEncoder e decodifica cada fluxo com AudioDecoder. Web Audio faz a mixagem local e um compressor final evita clipping. ADPCM permanece como compatibilidade para navegadores sem WebCodecs Opus; a sala só seleciona Opus se todos os clientes reportarem suporte.

Os requisitos de não espacialidade são mantidos: o encaminhamento e a mixagem não dependem da posição. Áudio de entrada e saída é mono; canais estéreo do dispositivo de saída podem reproduzir a mixagem mono normalmente. As preferências de mute individual continuam aplicadas no servidor.

## Achados e mudanças

- A malha WSS limitava cada ouvinte a oito vozes e escolhia por proximidade. Esse corte foi removido: cada participante que está ouvindo recebe cada falante não silenciado, até os 39 fluxos remotos possíveis.
- A malha WebRTC legada também tinha limite de oito conexões; seu teto agora é 39, sem prioridade por distância. WSS continua o padrão recomendado; a opção legada não muda o transporte padrão.
- O servidor valida o cabeçalho e limites do quadro, encaminha o mesmo buffer a todos e não decodifica, armazena ou grava áudio. O repasse requer O(N²) entregas na sala cheia: 1.560 envios por quadro completo (39 × 40), embora o processamento de bytes seja compartilhado por origem.
- Cada socket continua com teto de fila; congestionado, o ouvinte perde temporariamente quadros de voz. WebSocket sobre TCP não permite descartar um quadro já enfileirado na conexão TCP. Cabeçalhos seguintes também esperam a entrega dos bytes anteriores (head-of-line blocking); filas limitadas impedem latência ilimitada, mas não removem esse efeito.
- O codec agora usa 20 ms por quadro (50 quadros/s), mono 48 kHz, Opus 32 kbps inicial, com recuo local para 24 kbps quando `bufferedAmount` supera 2 KiB e recuperação após 2 s abaixo de 512 bytes; não há feedback de perda do receptor. FEC permanece desligada. Para WSS/TCP, retransmissão e FEC para perda no caminho não recuperam latência de retransmissão; FEC não deve ser ativada sem experimento controlado. O jitter buffer atual é por falante, começa em 80 ms, varia de 60 a 300 ms e agenda áudio recebido; o servidor continua sem buffer de mídia adicional.
- A entrada pede AEC ligado e NS/AGC nativos inicialmente desligados para preservar a dinâmica de canto. A disponibilidade/aplicação depende do navegador/dispositivo. AGC/limitador do cliente já nivela a captura. Não se adicionou APM WebRTC nem WASM: APM é biblioteca C++ integrável via compilação/WASM, não API Web padrão; envolve build, peso, manutenção e risco de duplicar AEC/NS nativos. Só vale reconsiderar após medições comparativas em dispositivos-alvo.
- AudioWorklet já está presente na captura. A reprodução usa AudioDecoder + AudioBufferSourceNode e um compressor comum; migrar cada voz para AudioWorklet não tem benefício demonstrado neste código e aumentaria a complexidade. Os 39 decodificadores por cliente são o principal risco de CPU no extremo e precisam de medição em navegadores modestos.

## Banda teórica para 40 participantes ativos

Suposições: cada pessoa envia um fluxo mono constante no bitrate indicado, 39 fluxos são entregues a cada cliente, sem DTX/silêncio, sem ADPCM, e taxa decimal. Entrada do servidor é 40 fluxos; saída é 1.560 entregas. Upload por jogador corresponde a um fluxo. Download por jogador recebe 39 fluxos. A banda total de saída é a soma do tráfego entregue a todos os jogadores.

| Bitrate por fluxo | Entrada servidor | Saída servidor | Upload por jogador | Download por jogador | Total de saída da sala |
| --- | ---: | ---: | ---: | ---: | ---: |
| 24 kbps | 0,96 Mbps | 37,44 Mbps | 24 kbps | 0,936 Mbps | 37,44 Mbps |
| 32 kbps | 1,28 Mbps | 49,92 Mbps | 32 kbps | 1,248 Mbps | 49,92 Mbps |
| 48 kbps | 1,92 Mbps | 74,88 Mbps | 48 kbps | 1,872 Mbps | 74,88 Mbps |

O tráfego bidirecional agregado do servidor (entrada + saída) é, respectivamente, 38,4, 51,2 e 76,8 Mbps. No quadro atual de 20 ms, 32 kbps geram cerca de 80 bytes Opus por quadro; 1.560 entregas de mídia representam cerca de 6,24 MB/s de payload agregado de saída a 50 quadros/s. O intervalo menor reduz atraso de empacotamento, com mais pacotes e overhead de cabeçalho por segundo. TLS, TCP/IP, WebSocket, Ethernet, ACKs e variações de VBR aumentam os números. Como exemplo de camada física, se cada quadro Opus de 80 bytes sair em um segmento Ethernet separado, cabeçalhos comuns somam perto de 100 bytes por quadro (WebSocket, TLS, TCP/IP e Ethernet), antes de ACKs e opções; nesse cenário, o bitrate de fio pode ser da ordem de 2,2× o payload e a saída do servidor perto de 110 Mbps. TLS/TCP podem agrupar dados e Ethernet/IPv6/opções mudam o valor, então é uma estimativa conservadora por pacote separado, não um benchmark. Medir na interface de rede do host e no proxy para obter o número real. ADPCM legado (~64 kbps de payload) é bem mais caro.

## Comparação das opções

| Opção | Benefício | Limitação neste projeto | Escolha |
| --- | --- | --- | --- |
| WSS + Opus | Compatibilidade com redes restritas, um socket autenticado, servidor leve e sem IPs entre jogadores | TCP HOL em perda/congestionamento; carga de banda de malha completa | Base recomendada enquanto a latência sob rede real for aceitável |
| WSS + AudioWorklet | Captura isolada do loop do jogo | Já implementado para captura; suporte moderno de desktop, fallback existente | Manter |
| Jitter adaptativo + PLC | Esconde variação e quadros ausentes | TCP retransmite bytes; não há perda independente por datagrama; PLC só é útil para lacunas/silêncio e suporte concreto do decoder | Manter folga adaptativa; medir, não somar camadas sem necessidade |
| Opus FEC/bitrate adaptativo | Ajuda em transporte datagrama e congestionamento variável | No WebSocket/TCP não corrige HOL; WebCodecs não expõe de forma portável todos os controles de Opus; controle adaptativo exigiria feedback/novo protocolo | Não ligar FEC cegamente; avaliar feedback por sala após telemetria de rede |
| WebRTC APM selecionado | AEC, NS e AGC maduros | Não é API JS nativa disponível ao WSS; exige compilar/empacotar APM, cuidado com licença BSD-3-Clause e duplicidade com processamento nativo do navegador | Usar os controles nativos de captura por enquanto |
| WebRTC completo | RTP/UDP, congestionamento e tratamento de perda próprios, latência melhor em redes ruins | ICE/STUN/TURN, mais portas, sinalização e operação; superfície e custos adicionais | Alternativa se medições provarem que TCP não atende |

AEC, NS e AGC solicitados nas restrições de captura são processamentos de `getUserMedia` implementados pelo navegador. Não são garantidos só por solicitar: conferir `getSettings()` e qualidade em cada navegador. Opus é normalmente amostrado a 48 kHz internamente; aumentar sample rate não significa aumentar bitrate nem melhora automaticamente voz. O bitrate é bits por segundo, a taxa de amostragem é amostras por segundo.

## CPU, memória e proteção

A codificação/decodificação acontece nos clientes. Para todos falando, cada participante executa até 39 decodificações e uma codificação. O servidor faz validação pequena e 1.560 chamadas de envio por rodada de quadros; a 50 quadros/s por pessoa são até 78.000 entregas/s na sala cheia, além da movimentação e mensagens do jogo. A fila de socket é limitada, mas throughput de saída do host e proxy é o gargalo operacional provável. Métricas atuais em `/status` mostram frames, bytes, descartes e congestionamento; CPU e banda devem ser medidas no host de produção. Não há estimativa responsável de CPU/memória cliente sem executar 39 decoders em navegadores e dispositivos definidos.

A autenticação permanece na sessão WebSocket de jogo; o servidor verifica sala, estado de fala/escuta e mute antes de encaminhar. O áudio não é persistido. Como o servidor/proxy TLS recebe os bytes em claro após TLS, esta arquitetura não oferece criptografia ponta-a-ponta.

## Verificação e pendências

Os testes automatizados existentes verificam formato, encaminhamento, filas, mute, isolamento entre salas e carga local sintética. Eles não são teste de áudio real nem de rede. Permanecem necessários testes com navegadores reais e 2, 10, 20 e 40 falantes, rede com atraso/perda, desconexão, permissões, clipping, CPU/memória do cliente e tráfego no host. Não se deve chamar esses resultados de medidos antes de executar tais cenários. WSS não fornece perda de pacote independente para simular PLC/FEC com fidelidade; a simulação de congestionamento/latência TCP deve ser feita na rede.

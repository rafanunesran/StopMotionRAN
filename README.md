# StopMotion RAN

Site para alunos criarem animações em **stop motion** usando a câmera do computador, tablet ou celular. Funciona 100% no navegador: não precisa de servidor, banco de dados nem login com senha.

## O que o aluno consegue fazer

- **Se identificar** com nome, turma e escola (opcional). Os nomes recentes aparecem como atalhos para trocar de aluno rápido no mesmo computador.
- **Gerenciar projetos**: criar, abrir, renomear e apagar animações. Cada aluno vê só os próprios projetos.
- **Fotografar com a câmera**:
  - escolha da câmera (frontal/traseira/webcam USB);
  - **papel de cebola** (mostra 1 a 3 quadros anteriores transparentes por cima da câmera) com ajuste de transparência;
  - grade da regra dos terços;
  - espelhar imagem;
  - temporizador de 3, 5 ou 10 segundos.
- **Editar os quadros**: selecionar, arrastar para reordenar, mover ◀ ▶ (para telas de toque), duplicar, apagar com **Desfazer**. Novas fotos entram logo depois do quadro selecionado.
- **Adicionar imagens** do computador como quadros (útil quando não há câmera).
- **Velocidade** de 1 a 24 quadros por segundo, com cálculo da duração.
- **Prévia** da animação, com opção de repetir.
- **Baixar o vídeo** (MP4 ou WebM, conforme o navegador) com o nome do projeto, do aluno e da turma.
- **Salvamento automático** no próprio navegador (IndexedDB).
- **Baixar/Importar arquivo do projeto** (`.stopmotion.json`) para continuar em outro computador ou entregar ao professor.

### Atalhos de teclado

| Tecla | Ação |
| --- | --- |
| Espaço | tirar foto |
| P | prévia / parar |
| ← → | escolher quadro |
| Delete | apagar quadro |
| D | duplicar quadro |
| Ctrl+Z | desfazer apagar |

## Onde ficam os dados

Os projetos ficam guardados **no navegador do dispositivo** usado. Se o aluno trocar de computador, limpar os dados do navegador ou usar janela anônima, os projetos não aparecem. Para levar um projeto para outro lugar, use **Baixar arquivo do projeto** e depois **Importar projeto**.

## Publicar na Vercel

O site é estático (HTML, CSS e JavaScript puros), então não há etapa de build.

1. Acesse [vercel.com/new](https://vercel.com/new) e entre com a conta do GitHub.
2. Clique em **Import** no repositório `StopMotionRAN`.
3. Em **Framework Preset**, deixe **Other**. Não preencha Build Command nem Output Directory.
4. Clique em **Deploy**.

Cada push na branch principal publica uma nova versão automaticamente. A Vercel serve o site em `https://`, o que é obrigatório para o navegador liberar a câmera. O arquivo `vercel.json` já permite o uso da câmera pelo próprio site.

Pela linha de comando (opcional):

```bash
npm i -g vercel
vercel        # prévia
vercel --prod # produção
```

## Rodar no próprio computador

A câmera só funciona em `https://` ou em `http://localhost`. Na pasta do projeto:

```bash
python3 -m http.server 8000
# ou: npx serve .
```

Depois abra <http://localhost:8000>.

## Navegadores

Funciona no Chrome, Edge, Firefox e Safari recentes (computador, Android e iPhone/iPad). O vídeo sai em MP4 quando o navegador sabe gravar MP4, e em WebM nos demais.

## Estrutura

```
index.html            telas (identificação, projetos, editor)
css/style.css         visual
js/db.js              armazenamento local (IndexedDB)
js/app.js             câmera, captura, quadros, prévia e exportação
vercel.json           cabeçalhos para a Vercel (permissão da câmera)
manifest.webmanifest  permite "instalar" o site no tablet/celular
```

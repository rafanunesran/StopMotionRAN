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
- **Enviar ao professor**: um clique gera o vídeo e manda direto para uma pasta no Google Drive do professor, organizada por turma. O aluno não precisa de conta Google. (Precisa configurar uma vez; veja abaixo.)
- **Usuário e senha do aluno** (opcional): o aluno cria o próprio usuário em segundos e, na aula seguinte, entra de novo em qualquer computador e continua o projeto. Os logins ficam numa planilha no Drive do professor.
- **Salvamento automático** no próprio navegador (IndexedDB) e, com usuário, **na nuvem a cada 5 minutos** (e ao sair do projeto), com botão para salvar na hora.
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

Com o servidor configurado (seção abaixo), cada aluno entra com usuário e senha e os projetos ficam também no **Google Drive do professor**, então dá para continuar em outro computador. Sem o servidor, os projetos ficam guardados **no navegador do dispositivo** usado. Se o aluno trocar de computador, limpar os dados do navegador ou usar janela anônima, os projetos não aparecem. Para levar um projeto para outro lugar, use **Baixar arquivo do projeto** e depois **Importar projeto**.

## Contas dos alunos e entrega no Google Drive do professor

O login com usuário e senha, o salvamento na nuvem e o botão **📤 Enviar ao professor** só aparecem depois desta configuração (feita uma vez, uns 5 minutos). Ela usa um pequeno programa do Google Apps Script que roda **na conta do professor**: os logins, os projetos e os vídeos ficam no Drive dele, e os alunos não precisam de conta Google.

1. No [Google Drive](https://drive.google.com), crie uma pasta, por exemplo **Entregas Stop Motion**. Abra a pasta e copie o ID do endereço: é o trecho depois de `/folders/` (ex.: `https://drive.google.com/drive/folders/`**`1AbCdEf...`**).
2. Abra [script.google.com](https://script.google.com), clique em **Novo projeto**, apague o que estiver escrito e cole todo o conteúdo de [`apps-script/Servidor.gs`](apps-script/Servidor.gs).
3. Na linha `const PASTA_ID = 'COLE_AQUI_O_ID_DA_PASTA';`, troque pelo ID copiado. Salve (ícone de disquete).
4. No menu de funções lá em cima, escolha **testarPasta** e clique em **Executar**. O Google vai pedir autorização: escolha sua conta, clique em **Avançado → Acessar (não seguro)** (o aviso aparece porque o script é seu e não foi publicado na loja) e **Permitir**. O registro deve mostrar "Tudo certo!" com o nome da pasta e o link da planilha de alunos, que é criada nessa hora dentro da pasta.
5. Clique em **Implantar → Nova implantação**, na engrenagem escolha **App da Web** e preencha:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
6. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`).
7. Cole esse URL em [`js/config.js`](js/config.js), no campo `servidorUrl`, e faça o commit no `main`. A Vercel publica e o site passa a pedir usuário e senha.

Como fica no Drive:

```
Entregas Stop Motion/
  StopMotion RAN - Alunos        planilha: usuário, nome, turma, escola, último acesso
  Projetos dos alunos/
    ana.souza/<projeto>/         projeto.json + uma foto por quadro
  6º A/
    6º A - Ana Souza - Minha animação - 2026-11-09 14h30.mp4
```

**Aluno esqueceu a senha?** Abra a planilha, escreva uma senha nova na coluna **Nova senha (professor)** da linha dele e passe para o aluno. Quando ele entrar com ela, ela vira a senha dele e a célula se apaga. As senhas não ficam visíveis na planilha (a coluna "Senha protegida" guarda só um código).

**Vídeos enviados:** A descrição do arquivo traz aluno, turma, escola, número de quadros e velocidade. Se o aluno enviar de novo, chega um arquivo novo (o anterior não é apagado). Se o envio falhar, o aluno pode baixar o vídeo pelo próprio aviso de erro.

Se mudar o código do script depois, use **Implantar → Gerenciar implantações → editar → Nova versão** para manter o mesmo URL.

O projeto é salvo na nuvem a cada 5 minutos enquanto o aluno edita, quando ele volta para a lista de projetos, quando clica em **Trocar aluno** e quando clica em **☁ Salvar na nuvem agora**. Se o aluno tentar fechar a aba com mudanças ainda não enviadas, o navegador pergunta antes. Ao abrir um projeto, o site confere se há uma versão mais nova na nuvem (feita em outro computador) e baixa.

Observação: qualquer pessoa com o site pode criar um usuário e enviar vídeos para essa pasta (o script só aceita vídeo MP4/WebM de até 300 MB). Não coloque outros arquivos importantes dentro dela.

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
js/app.js             câmera, captura, quadros, prévia, exportação e envio
js/config.js          endereço do servidor (Apps Script) no Drive do professor
apps-script/          servidor no Google Apps Script: contas, projetos na nuvem e vídeos
vercel.json           cabeçalhos para a Vercel (permissão da câmera)
manifest.webmanifest  permite "instalar" o site no tablet/celular
```

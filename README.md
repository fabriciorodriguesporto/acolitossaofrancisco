# Sistema de Escala dos Acólitos

Guia rápido para conectar o projeto a um banco Supabase e liberar o primeiro acesso administrativo.

## 1. Criar uma conta e um projeto Supabase

1. Acesse [supabase.com/dashboard/sign-up](https://supabase.com/dashboard/sign-up) e crie sua conta.
2. No Dashboard, selecione **New project** (ou **Create a project**).
3. Crie ou selecione uma organização, informe um nome para o projeto e escolha o plano **Free**.
4. Crie uma senha forte para o banco de dados e guarde-a em um local seguro. Essa senha não é a senha do painel de acólitos.
5. Escolha a região mais próxima de você e crie o projeto. Aguarde o provisionamento terminar.

## 2. Criar as tabelas e políticas do banco

1. Abra o arquivo [schema.sql](./schema.sql) neste repositório.
2. Copie o conteúdo completo do arquivo.
3. No Supabase, abra o projeto e selecione **SQL Editor** no menu lateral.
4. Clique em **New query**, cole o SQL e clique em **Run**.
5. Verifique no **Table Editor** se foram criadas as tabelas `acolitos`, `missas_editadas`, `missas_funcoes` e `admin_users`.

O arquivo também configura as políticas de segurança (RLS), a função usada para recalcular as escalas e a publicação Realtime. Embora a tela principal consulte diretamente `acolitos` e `missas_editadas`, as outras duas tabelas são necessárias para guardar as funções e autorizar administradores. Execute o esquema antes de usar o painel.

## 3. Conectar o projeto ao `app.js`

1. No Dashboard do Supabase, abra **Connect** ou as configurações do projeto em **Project Settings → API Keys** (a URL do projeto fica em **Project Settings → API** ou no diálogo **Connect**).
2. Copie a **Project URL**.
3. Copie a chave pública recomendada, chamada **Publishable key** (começa com `sb_publishable_`). Em projetos ou telas que ainda mostram as chaves legadas, pode usar a chave **`anon` / `anon public`**. Ambas são destinadas ao cliente público e são aceitas neste projeto.
4. Abra [app.js](./app.js) no VS Code e substitua as duas constantes no início do arquivo:

   ```js
   const SUPABASE_URL = 'COLE_A_PROJECT_URL_AQUI';
   const SUPABASE_ANON_KEY = 'COLE_A_CHAVE_PUBLICA_AQUI';
   ```

5. Salve o arquivo.

Essas chaves públicas ficam visíveis no navegador; a proteção dos dados é feita pelas políticas RLS criadas no passo anterior. **Nunca** cole no `app.js` uma chave **Secret**, `service_role` ou outra chave privilegiada: ela ignora as políticas de segurança e não deve ser publicada. Consulte a [documentação oficial sobre chaves do Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

## 4. Criar e autorizar o primeiro administrador

Criar um usuário em Authentication não o torna administrador automaticamente: o UUID dele também precisa estar na tabela `admin_users`.

1. No menu do projeto, abra **Authentication → Users**.
2. Clique em **Add user** (ou **Create user**) e informe o e-mail e uma senha forte. Se aparecer a opção de confirmar o e-mail automaticamente e você estiver criando uma conta de teste, marque-a; caso contrário, confirme o endereço pelo e-mail recebido.
3. Depois de criar o usuário, copie o UUID/ID dele na lista de usuários.
4. Volte ao **SQL Editor**, crie uma nova consulta e execute o comando abaixo, trocando o texto entre aspas pelo UUID copiado:

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID_DO_USUARIO_AQUI')
   on conflict (user_id) do nothing;
   ```

5. Abra `login.html`, entre com o e-mail e a senha criados e o sistema encaminhará a conta autorizada para `admin.html`.

## 5. Abrir o projeto para testar

Abra a pasta no VS Code e use uma extensão de servidor local, como **Live Server**. Acesse `index.html` para ver o calendário ou `login.html` para entrar no painel. Evite abrir os arquivos diretamente com `file://`.

Se as chaves ainda estiverem como placeholders ou não houver acólitos ativos cadastrados, `index.html` exibirá acólitos e escalas fictícios em modo de demonstração. Esses exemplos servem apenas para visualizar o layout e não são gravados no Supabase.

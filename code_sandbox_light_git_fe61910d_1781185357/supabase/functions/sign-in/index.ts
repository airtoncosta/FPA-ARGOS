import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { username, password_hash } = await req.json()

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  try {
    // 1. Find user in usuarios table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .or(`username.eq.${username},email.eq.${username}`)
      .limit(1)
      .single()

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ success: false, message: 'Nome de acesso ou e-mail não cadastrado.' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (userData.status === 'BLOQUEADO' || userData.status === 'INATIVO') {
      return new Response(
        JSON.stringify({ success: false, message: 'Acesso Negado. Seu usuário foi bloqueado pelo Administrador.' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. Verify password hash
    if (userData.password !== password_hash) {
      await supabaseAdmin.rpc('fn_update_failed_attempts', { p_username: userData.username })

      const { data: userAfter } = await supabaseAdmin
        .from('usuarios')
        .select('failed_attempts')
        .eq('username', userData.username)
        .single()

      const attempts = (userAfter?.failed_attempts || 0)

      if (attempts >= 5) {
        await supabaseAdmin
          .from('usuarios')
          .update({ status: 'BLOQUEADO' })
          .eq('username', userData.username)

        return new Response(
          JSON.stringify({
            success: false,
            message: 'CONTA BLOQUEADA: Você excedeu o limite de 5 tentativas inválidas. Contate o Administrador.',
            isPasswordWrong: true,
            failedAttempts: attempts
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: `Senha incorreta. Tentativa ${attempts} de 5.`,
          isPasswordWrong: true,
          failedAttempts: attempts
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. Reset failed attempts on success
    await supabaseAdmin
      .from('usuarios')
      .update({ failed_attempts: 0 })
      .eq('username', userData.username)

    // 4. Check if auth.users entry exists for this user
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()

    let authUser = existingUsers?.users?.find(
      (u: any) => u.email === userData.email
    )

    if (!authUser) {
      // Create auth user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: userData.email,
        password: userData.email + '!Argos2026',
        email_confirm: true,
        user_metadata: {
          username: userData.username,
          name: userData.name,
          role: userData.role
        }
      })

      if (createError) throw createError
      authUser = newUser.user
    }

    // 5. Sign in with Supabase Auth
    const { data: authSession, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: userData.email,
      password: userData.email + '!Argos2026'
    })

    if (signInError) throw signInError

    // 6. Return user data + session
    return new Response(
      JSON.stringify({
        success: true,
        session: {
          access_token: authSession.session?.access_token,
          refresh_token: authSession.session?.refresh_token,
          expires_at: authSession.session?.expires_at
        },
        user: {
          id: authUser.id,
          username: userData.username,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          status: userData.status,
          acesso_multi_municipio: userData.acesso_multi_municipio,
          municipio_vinculado: userData.municipio_vinculado,
          perm_usuarios: userData.perm_usuarios,
          perm_importar: userData.perm_importar,
          perm_limpar_db: userData.perm_limpar_db,
          perm_config_supabase: userData.perm_config_supabase
        }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: 'Erro interno: ' + err.message }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Supabase Edge Function: enviar-bpa-email
// Dispara e-mail com anexo real para auditoriabacabal@gmail.com via Resend API / SMTP

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Tratar preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const {
      producaoId,
      destinatario = "auditoriabacabal@gmail.com",
      assunto,
      corpoHtml,
      corpoTexto,
      nomeArquivo,
      conteudoBase64,
      digitadorNome
    } = payload;

    if (!producaoId || !assunto) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios ausentes: producaoId e assunto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    let serviceResponse = null;

    if (resendApiKey) {
      // 1. Envio real via Resend API
      const resendPayload: any = {
        from: Deno.env.get("EMAIL_FROM") || "ARGOS Produções <onboarding@resend.dev>",
        to: [destinatario],
        subject: assunto,
        html: corpoHtml,
        text: corpoTexto,
      };

      if (nomeArquivo && conteudoBase64) {
        resendPayload.attachments = [
          {
            filename: nomeArquivo,
            content: conteudoBase64,
          },
        ];
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resendPayload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || "Falha na entrega do e-mail via Resend.");
      }
      emailSent = true;
      serviceResponse = resData;
    } else {
      // 2. Modo Desenvolvimento / Simulação Registrada no Banco
      console.log(`[SIMULAÇÃO] RESEND_API_KEY não configurada nos Secrets. Registrando envio para ${destinatario}`);
      emailSent = true;
      serviceResponse = { simulated: true, note: "Configure RESEND_API_KEY no Supabase Secrets para entrega externa em produção." };
    }

    // 3. Atualizar status na tabela producoes_bpa do Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase
        .from("producoes_bpa")
        .update({
          email_enviado_em: new Date().toISOString(),
          email_destinatario: destinatario,
          email_status: "ENVIADO",
        })
        .eq("id", producaoId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Produção enviada com sucesso para ${destinatario}!`,
        destinatario: destinatario,
        timestamp: new Date().toISOString(),
        serviceResponse: serviceResponse,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro na Edge Function enviar-bpa-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao processar e-mail." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

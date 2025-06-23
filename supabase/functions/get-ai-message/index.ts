// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Define CORS headers directly in the function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// This function will now be called with an auth header,
// so we can initialize a Supabase client with the user's permissions.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { websiteUrl, personalityBase, customInstructions } = await req.json();
    
    let siteContent = '';
    try {
      const response = await fetch(websiteUrl);
      if (response.ok) {
        const html = await response.text();
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        siteContent = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
        siteContent = siteContent.substring(0, 5000); // Allow more content for better analysis
      }
    } catch (fetchError) {
      console.error(`Error fetching website content: ${fetchError.message}`);
    }

    const systemPrompt = `
      You are an AI assistant that generates dialogue for a website character.
      Your base personality is: ${personalityBase}.
      ${customInstructions ? `Follow these special instructions: ${customInstructions}`: ''}
      Based on the website content provided, generate a list of 20 to 40 short, engaging, and distinct sentences that the character could say to a new visitor.
      The output MUST be a valid JSON array of strings inside a JSON object with a "dialogue" key. For example: {"dialogue": ["Hello there!", "Welcome to the site.", "This place is cool!", "..."]}
    `;
    const userPrompt = `Website Content: "${siteContent || 'No content was found. Just generate some friendly greetings based on the personality.'}"`;

    const deepseekResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt } ],
        response_format: { type: 'json_object' },
        max_tokens: 2000, // Increase token limit for more suggestions
        temperature: 0.9,
      }),
    });

    if (!deepseekResponse.ok) {
      const errorBody = await deepseekResponse.text();
      throw new Error(`DeepSeek API error: ${deepseekResponse.status} ${errorBody}`);
    }

    const deepseekData = await deepseekResponse.json();
    let dialogueLines = [];
    try {
        const content = JSON.parse(deepseekData.choices[0]?.message?.content);
        dialogueLines = content.dialogue || [];
        if (!Array.isArray(dialogueLines)) throw new Error("AI did not return a valid array in the 'dialogue' key.");
    } catch (parseError) {
        console.error("Failed to parse AI response:", parseError, deepseekData.choices[0]?.message?.content);
        throw new Error("The AI returned an unexpected format. Please try again.");
    }

    return new Response(JSON.stringify({ dialogue: dialogueLines }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/get-ai-message' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

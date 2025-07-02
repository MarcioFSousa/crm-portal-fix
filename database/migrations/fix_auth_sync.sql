-- Migração para corrigir o problema de sincronização entre auth.users e public.usuarios

-- 1. Criar função para limpar registros duplicados
CREATE OR REPLACE FUNCTION public.clean_duplicate_usuarios(p_email TEXT)
RETURNS VOID AS $$
BEGIN
    -- Deletar registros soft-deleted para o mesmo email
    DELETE FROM public.usuarios 
    WHERE email = p_email AND deleted_at IS NOT NULL;
    
    -- Se existir mais de um registro ativo, manter apenas o mais recente
    DELETE FROM public.usuarios 
    WHERE email = p_email 
    AND id NOT IN (
        SELECT id FROM public.usuarios 
        WHERE email = p_email AND deleted_at IS NULL
        ORDER BY created_at DESC 
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Função para criar usuário com sincronização correta
CREATE OR REPLACE FUNCTION public.create_portal_user_with_sync(
    p_email TEXT,
    p_password TEXT,
    p_nome TEXT,
    p_cliente_id UUID
) RETURNS JSON AS $$
DECLARE
    v_auth_user_id UUID;
    v_result JSON;
BEGIN
    -- Limpar registros duplicados primeiro
    PERFORM public.clean_duplicate_usuarios(p_email);
    
    -- Verificar se já existe usuário ativo com este email
    IF EXISTS (
        SELECT 1 FROM public.usuarios 
        WHERE email = p_email AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Email já cadastrado no sistema'
        );
    END IF;
    
    -- Criar usuário no auth.users via RPC (isso deve ser feito pelo frontend)
    -- Esta função assumirá que o ID será passado do frontend após criação bem-sucedida
    
    RETURN json_build_object(
        'success', true,
        'message', 'Função preparada para sincronização. Execute a criação via frontend.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função para sincronizar usuário após criação no auth
CREATE OR REPLACE FUNCTION public.sync_user_after_auth_creation(
    p_auth_user_id UUID,
    p_email TEXT,
    p_nome TEXT,
    p_cliente_id UUID
) RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Inserir na tabela usuarios usando o MESMO ID do auth.users
    INSERT INTO public.usuarios (
        id,
        nome,
        email,
        tipo_usuario,
        tenant_id,
        created_by,
        updated_by
    ) VALUES (
        p_auth_user_id,  -- MESMO ID do auth.users!
        p_nome,
        p_email,
        'cliente',
        p_auth_user_id,
        p_auth_user_id,
        p_auth_user_id
    );
    
    -- Atualizar cliente para referenciar o usuário do portal
    UPDATE public.clientes 
    SET 
        usuario_portal_id = p_auth_user_id,
        updated_at = NOW(),
        updated_by = p_auth_user_id
    WHERE id = p_cliente_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', p_auth_user_id,
        'message', 'Usuário sincronizado com sucesso'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Erro ao sincronizar usuário: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Adicionar coluna usuario_portal_id na tabela clientes se não existir
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS usuario_portal_id UUID REFERENCES auth.users(id);

-- 5. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_clientes_usuario_portal 
ON public.clientes(usuario_portal_id) 
WHERE usuario_portal_id IS NOT NULL;

-- 6. Comentários para documentação
COMMENT ON FUNCTION public.clean_duplicate_usuarios(TEXT) IS 
'Limpa registros duplicados na tabela usuarios para um email específico';

COMMENT ON FUNCTION public.sync_user_after_auth_creation(UUID, TEXT, TEXT, UUID) IS 
'Sincroniza usuário na tabela public.usuarios após criação bem-sucedida no auth.users';

COMMENT ON COLUMN public.clientes.usuario_portal_id IS 
'Referência ao usuário do portal de cliente na tabela auth.users';

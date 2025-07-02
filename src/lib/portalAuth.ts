import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface CreatePortalUserParams {
  email: string;
  password: string;
  nomeCliente: string;
  clienteId: string;
}

interface CreatePortalUserResponse {
  success: boolean;
  error?: string;
  message?: string;
  userId?: string;
}

/**
 * Função corrigida para criar usuário do portal
 * Resolve o problema de sincronização entre auth.users e public.usuarios
 */
export async function createPortalUser({
  email,
  password,
  nomeCliente,
  clienteId
}: CreatePortalUserParams): Promise<CreatePortalUserResponse> {
  try {
    // 1. Verificar se email já existe e limpar duplicados
    const { data: cleanResult, error: cleanError } = await supabase
      .rpc('clean_duplicate_usuarios', { p_email: email });

    if (cleanError) {
      console.error('Erro ao limpar duplicados:', cleanError);
      // Continuar mesmo com erro na limpeza
    }

    // 2. Verificar se já existe usuário ativo com este email
    const { data: existingUser, error: checkError } = await supabase
      .from('usuarios')
      .select('id, email')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Erro ao verificar usuário existente: ${checkError.message}`);
    }

    if (existingUser) {
      return {
        success: false,
        error: 'Este email já está cadastrado no sistema'
      };
    }

    // 3. Criar usuário no auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        nome: nomeCliente,
        tipo_usuario: 'cliente',
        cliente_id: clienteId
      }
    });

    if (authError) {
      console.error('Erro ao criar usuário no auth:', authError);
      throw new Error(`Erro na autenticação: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error('Usuário não foi criado corretamente');
    }

    const authUserId = authData.user.id;

    // 4. Sincronizar com a tabela public.usuarios usando o MESMO ID
    const { data: syncResult, error: syncError } = await supabase
      .rpc('sync_user_after_auth_creation', {
        p_auth_user_id: authUserId,
        p_email: email,
        p_nome: nomeCliente,
        p_cliente_id: clienteId
      });

    if (syncError) {
      console.error('Erro ao sincronizar usuário:', syncError);
      
      // Tentar reverter a criação do usuário no auth
      try {
        await supabase.auth.admin.deleteUser(authUserId);
      } catch (deleteError) {
        console.error('Erro ao reverter criação do usuário:', deleteError);
      }
      
      throw new Error(`Erro ao sincronizar usuário: ${syncError.message}`);
    }

    // Verificar se a sincronização foi bem-sucedida
    if (!syncResult?.success) {
      // Tentar reverter a criação do usuário no auth
      try {
        await supabase.auth.admin.deleteUser(authUserId);
      } catch (deleteError) {
        console.error('Erro ao reverter criação do usuário:', deleteError);
      }
      
      throw new Error(syncResult?.error || 'Erro desconhecido na sincronização');
    }

    // 5. Verificar se o usuário foi criado corretamente na tabela usuarios
    const { data: verifyUser, error: verifyError } = await supabase
      .from('usuarios')
      .select('id, email, nome, tipo_usuario')
      .eq('id', authUserId)
      .single();

    if (verifyError || !verifyUser) {
      console.error('Erro na verificação final:', verifyError);
      throw new Error('Usuário criado mas não encontrado na verificação');
    }

    console.log('✅ Usuário criado e sincronizado com sucesso:', {
      authId: authUserId,
      publicId: verifyUser.id,
      email: verifyUser.email,
      idsMatch: authUserId === verifyUser.id
    });

    return {
      success: true,
      message: 'Portal criado com sucesso! O cliente pode agora fazer login.',
      userId: authUserId
    };

  } catch (error: any) {
    console.error('❌ Erro ao criar portal:', error);
    
    return {
      success: false,
      error: error.message || 'Erro interno do servidor'
    };
  }
}

/**
 * Hook para usar em componentes React
 */
export function useCreatePortalUser() {
  const [loading, setLoading] = useState(false);

  const createUser = async (params: CreatePortalUserParams) => {
    setLoading(true);
    
    try {
      const result = await createPortalUser(params);
      
      if (result.success) {
        toast.success(result.message || 'Portal criado com sucesso!');
        return result;
      } else {
        toast.error(result.error || 'Erro ao criar portal');
        return result;
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Erro inesperado ao criar portal';
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return { createUser, loading };
}

/**
 * Função para testar a sincronização de um usuário existente
 * Usar apenas para debug
 */
export async function testUserSync(email: string) {
  try {
    // Buscar na auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Erro ao buscar auth users:', authError);
      return;
    }

    const authUser = authUsers.users.find(u => u.email === email);
    
    if (!authUser) {
      console.log('❌ Usuário não encontrado em auth.users');
      return;
    }

    // Buscar na public.usuarios
    const { data: publicUser, error: publicError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    if (publicError) {
      console.error('❌ Usuário não encontrado em public.usuarios:', publicError);
      return;
    }

    console.log('🔍 Verificação de sincronização:', {
      authId: authUser.id,
      publicId: publicUser.id,
      email: email,
      idsMatch: authUser.id === publicUser.id,
      authUser: authUser,
      publicUser: publicUser
    });

    return {
      authId: authUser.id,
      publicId: publicUser.id,
      idsMatch: authUser.id === publicUser.id
    };

  } catch (error) {
    console.error('❌ Erro no teste de sincronização:', error);
  }
}

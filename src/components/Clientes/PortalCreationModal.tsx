import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useCreatePortalUser, testUserSync } from '@/lib/portalAuth';
import { toast } from 'sonner';

interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  usuario_portal_id?: string;
}

interface PortalCreationModalProps {
  cliente: Cliente;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function PortalCreationModal({ cliente, trigger, onSuccess }: PortalCreationModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: cliente.email || '',
    password: '',
    confirmPassword: '',
    nomeCliente: cliente.nome || ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { createUser, loading } = useCreatePortalUser();

  // Verificar se já tem portal criado
  const hasPortal = Boolean(cliente.usuario_portal_id);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.email) {
      errors.email = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Email inválido';
    }

    if (!formData.password) {
      errors.password = 'Senha é obrigatória';
    } else if (formData.password.length < 6) {
      errors.password = 'Senha deve ter pelo menos 6 caracteres';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Confirmação de senha é obrigatória';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Senhas não coincidem';
    }

    if (!formData.nomeCliente.trim()) {
      errors.nomeCliente = 'Nome do cliente é obrigatório';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const result = await createUser({
        email: formData.email,
        password: formData.password,
        nomeCliente: formData.nomeCliente,
        clienteId: cliente.id
      });

      if (result.success) {
        setIsOpen(false);
        setFormData({
          email: cliente.email || '',
          password: '',
          confirmPassword: '',
          nomeCliente: cliente.nome || ''
        });
        setFormErrors({});
        onSuccess?.();
      }
    } catch (error) {
      console.error('Erro no formulário:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpar erro específico quando usuário começar a digitar
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleTestSync = async () => {
    if (!formData.email) {
      toast.error('Digite um email para testar');
      return;
    }
    
    const result = await testUserSync(formData.email);
    if (result) {
      if (result.idsMatch) {
        toast.success('✅ IDs sincronizados corretamente!');
      } else {
        toast.error('❌ IDs não estão sincronizados');
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant={hasPortal ? "outline" : "default"} size="sm">
            {hasPortal ? 'Gerenciar Portal' : 'Criar Portal'}
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasPortal ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                Portal Existente
              </>
            ) : (
              'Criar Portal do Cliente'
            )}
          </DialogTitle>
          <DialogDescription>
            {hasPortal 
              ? 'Este cliente já possui um portal de acesso.'
              : 'Crie um portal de acesso para que o cliente possa visualizar seus dados.'
            }
          </DialogDescription>
        </DialogHeader>

        {hasPortal ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Portal já está ativo para este cliente.
                  </AlertDescription>
                </Alert>
                
                <div className="grid gap-2">
                  <Label>Email de acesso:</Label>
                  <Input value={cliente.email} disabled />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleTestSync} 
                    variant="outline" 
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4" />
                    Testar Sincronização
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="nomeCliente">Nome do Cliente</Label>
              <Input
                id="nomeCliente"
                value={formData.nomeCliente}
                onChange={(e) => handleInputChange('nomeCliente', e.target.value)}
                placeholder="Nome completo do cliente"
                className={formErrors.nomeCliente ? 'border-red-500' : ''}
              />
              {formErrors.nomeCliente && (
                <span className="text-sm text-red-500">{formErrors.nomeCliente}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email de Acesso</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="email@exemplo.com"
                className={formErrors.email ? 'border-red-500' : ''}
              />
              {formErrors.email && (
                <span className="text-sm text-red-500">{formErrors.email}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={formErrors.password ? 'border-red-500 pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {formErrors.password && (
                <span className="text-sm text-red-500">{formErrors.password}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  placeholder="Digite a senha novamente"
                  className={formErrors.confirmPassword ? 'border-red-500 pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {formErrors.confirmPassword && (
                <span className="text-sm text-red-500">{formErrors.confirmPassword}</span>
              )}
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Esta versão corrige o problema de sincronização entre auth.users e public.usuarios.
                Os IDs agora serão idênticos em ambas as tabelas.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Criando Portal...' : 'Criar Portal'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Componente para usar na listagem de clientes
interface ClienteRowActionProps {
  cliente: Cliente;
  onPortalCreated?: () => void;
}

export function ClienteRowAction({ cliente, onPortalCreated }: ClienteRowActionProps) {
  const hasPortal = Boolean(cliente.usuario_portal_id);

  return (
    <PortalCreationModal
      cliente={cliente}
      onSuccess={onPortalCreated}
      trigger={
        <Button 
          variant={hasPortal ? "outline" : "default"} 
          size="sm"
          className={hasPortal ? "text-green-600 border-green-200" : ""}
        >
          {hasPortal ? (
            <>
              <CheckCircle className="mr-1 h-3 w-3" />
              Portal Ativo
            </>
          ) : (
            'Criar Portal'
          )}
        </Button>
      }
    />
  );
}

export default PortalCreationModal;

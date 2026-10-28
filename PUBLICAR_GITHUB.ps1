$ErrorActionPreference = 'Stop'
$targetRepo = 'https://github.com/diegotbyrro-ui/PURM.git'
$sourceRoot = $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$workRoot = Join-Path ([Environment]::GetFolderPath('Desktop')) ('PURM_GITHUB_' + $stamp)
$repoRoot = Join-Path $workRoot 'repositorio'
$logPath = Join-Path $workRoot 'publicacao.log'
$completed = $false
$stage = 'Preparacao'
$commitSha = ''
function Invoke-GitChecked {
    param([string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw ('Git falhou: ' + ($GitArgs -join ' ') + ' | codigo ' + $LASTEXITCODE) }
}
try {
    New-Item -ItemType Directory -Path $workRoot -ErrorAction Stop | Out-Null
    Start-Transcript -Path $logPath | Out-Null
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Instale o Git para Windows antes de executar este script.' }
    if (-not (Test-Path (Join-Path $sourceRoot 'dist/index.html'))) { throw 'Extraia todo o ZIP antes de executar PUBLICAR_GITHUB.ps1.' }
    $stage = 'Verificar repositorio remoto vazio'
    Write-Host ('Destino: ' + $targetRepo)
    $remoteRefs = @(& git ls-remote --heads --tags $targetRepo)
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar o repositorio. Confira a internet e seu acesso ao GitHub.' }
    if ($remoteRefs.Count -gt 0) { throw 'O repositorio remoto ja tem commits. Publicacao interrompida para preservar o conteudo existente. Envie o log ao chat.' }
    $stage = 'Copiar fonte para pasta isolada'
    New-Item -ItemType Directory -Path $repoRoot | Out-Null
    Get-ChildItem -LiteralPath $sourceRoot -Force | Where-Object { $_.Name -notin @('.git','node_modules','outputs') } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $repoRoot -Recurse -Force
    }
    $stage = 'Criar commit inicial'
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'init','-b','main')
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'config','user.name','Diego Taketomi')
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'config','user.email','259961329+diegotbyrro-ui@users.noreply.github.com')
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'remote','add','origin',$targetRepo)
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'add','--','README.md','CRM_CONTEXTO.md','ASSET_NOTES.md','.gitignore','.openai/hosting.json','dist','PUBLICAR_GITHUB.ps1')
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'diff','--cached','--check')
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'commit','-m','Import approved PURM website and CRM handoff')
    $commitSha = (& git -C $repoRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel identificar o commit local.' }
    $stage = 'Enviar ao GitHub'
    Write-Host 'Se o Git abrir uma tela de autenticacao, entre na sua conta GitHub. Nao cole senhas ou tokens no chat.' -ForegroundColor Cyan
    Invoke-GitChecked -GitArgs @('-C',$repoRoot,'push','-u','origin','main')
    $stage = 'Confirmar commit remoto'
    $published = @(& git ls-remote $targetRepo 'refs/heads/main')
    if ($LASTEXITCODE -ne 0 -or $published.Count -ne 1) { throw 'Push executado, mas a confirmacao remota nao foi concluida. Nao repita sem conferir o GitHub.' }
    $remoteSha = ($published[0] -split '\s+')[0]
    if ($remoteSha -ne $commitSha) { throw 'O commit remoto difere do commit enviado. Confira o repositorio antes de prosseguir.' }
    $completed = $true
    Write-Host ''
    Write-Host 'PUBLICACAO CONCLUIDA E VERIFICADA' -ForegroundColor Green
    Write-Host 'Repositorio: https://github.com/diegotbyrro-ui/PURM'
    Write-Host ('Branch: main | Commit: ' + $commitSha)
    Write-Host ('Arquivos: ' + ((& git -C $repoRoot ls-files) -join ', '))
    Write-Host ('Copia isolada: ' + $repoRoot)
    Write-Host 'Originais preservados. Nenhum reset, stash, pull ou force-push foi usado.'
    Write-Host 'No novo chat, conecte este repositorio e peca a leitura de CRM_CONTEXTO.md.'
} catch {
    Write-Host ''
    Write-Host ('ERRO NA ETAPA: ' + $stage) -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ('Pasta preservada: ' + $workRoot)
    if ($commitSha) { Write-Host ('Commit local: ' + $commitSha) }
    Write-Host 'Copie o relatorio e envie ao chat antes de tentar novamente.'
} finally {
    Write-Host ('Log: ' + $logPath)
    Write-Host ('Resultado: ' + $(if ($completed) { 'OK' } else { 'NAO CONCLUIDO' }))
    try { Stop-Transcript | Out-Null } catch {}
    [void](Read-Host 'Pressione Enter para terminar')
}

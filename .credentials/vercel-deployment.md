# Vercel Deployment Credentials

**⚠️ TOKEN STORED LOCALLY ONLY - NOT IN REPO**

The Vercel token is stored in this file on your local machine but was removed from git to prevent security issues.

**Project ID:** `prj_Frx97DZH05ZXiMkinT3kURmfV271`
**Org ID:** `team_4AMCMmyYIJNDVTy2izuFctBk`
**Project Name:** `kumolab-anime`

## Usage

```bash
vercel deploy --prod --token <TOKEN> --yes
```

Or with env vars:
```bash
export VERCEL_ORG_ID=team_4AMCMmyYIJNDVTy2izuFctBk
export VERCEL_PROJECT_ID=prj_Frx97DZH05ZXiMkinT3kURmfV271
vercel deploy --prod --token <TOKEN> --yes
```

## GitHub Actions Auto-Deploy

The repository now has `.github/workflows/deploy.yml` which:
- Auto-deploys to production on every push to `main`
- Deploys preview builds for pull requests
- Uses the VERCEL_TOKEN secret (must be configured in GitHub repo settings)

### Setup Required

Add the token to GitHub repository secrets:
1. Go to https://github.com/gonxjose98/kumolab-anime/settings/secrets/actions
2. Click "New repository secret"
3. Name: `VERCEL_TOKEN`
4. Value: The token above
5. Click "Add secret"

Once configured, every push to main will automatically deploy.

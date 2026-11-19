import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { calculateRanking } from '../domain/ranking'
import { loadCampScoreTotals, readAllPages, totalsAsScoreEntries } from '../features/scores/scoreTotals'
import { supabase } from '../lib/supabase'
import { isValidSlug } from '../utils/slug'
import { logError } from '../utils/logger'
import EntitySymbol from '../components/EntitySymbol'
import { connectionMessage } from '../utils/network'

export default function PublicCampRanking() {
  const { campSlug = '' } = useParams()
  const [camp, setCamp] = useState(null)
  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let shouldIgnore = false

    async function loadRanking() {
      setLoading(true)
      setNotFound(false)
      setError('')

      if (!isValidSlug(campSlug)) {
        if (shouldIgnore) return
        setCamp(null)
        setRanking([])
        setNotFound(true)
        setLoading(false)
        return
      }

      const { data: campData, error: campError } = await supabase
        .from('camps')
        .select('id, name, church_name, theme, slug, public_ranking_enabled')
        .eq('slug', campSlug)
        .eq('public_ranking_enabled', true)
        .maybeSingle()

      if (shouldIgnore) return

      if (campError) {
        logError('PublicCampRanking', campError)
        setError(connectionMessage(campError))
        setLoading(false)
        return
      }

      if (!campData) {
        setCamp(null)
        setRanking([])
        setNotFound(true)
        setLoading(false)
        return
      }

      const { data: teamsData, error: teamsError } = await readAllPages(() => supabase
        .from('public_ranking_competition_teams')
        .select('id, name, color, symbol')
        .eq('camp_id', campData.id)
        .order('name')
        .order('id')
      )

      const { data: totalsData, error: eventsError } = await loadCampScoreTotals(
        supabase, 'public_camp_score_totals', campData.id,
      )

      if (shouldIgnore) return

      if (teamsError || eventsError) {
        logError('PublicCampRanking', teamsError || eventsError)
        setError(connectionMessage(teamsError || eventsError))
        setLoading(false)
        return
      }

      setCamp(campData)
      setRanking(
        calculateRanking(
          teamsData || [],
          totalsAsScoreEntries(totalsData || []),
          [],
          {
            includeInactive: true,
            scoreTeamIdField: 'competition_team_id',
            participantTeamIdField: 'competition_team_id',
          },
        ).map((team) => ({
          ...team,
          participantsCount: Number(totalsData?.find((total) => total.competition_team_id === team.id)?.participants_count || 0),
        })),
      )
      setLoading(false)
    }

    loadRanking()
    const retry = () => { void loadRanking() }
    window.addEventListener('acampgestor:retry-reads', retry)

    return () => {
      shouldIgnore = true
      window.removeEventListener('acampgestor:retry-reads', retry)
    }
  }, [campSlug, attempt])

  function getPointsColor(total, index) {
    if (total < 0) return 'text-red-400'
    if (index <= 2) return 'text-green-400'
    return 'text-yellow-500'
  }

  const topThree = ranking.slice(0, 3)

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-8 text-white md:px-8 md:py-10">
      <section className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-yellow-500 md:text-sm">
              AcampGestor
            </p>

            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              {camp?.name || 'Ranking do acampamento'}
            </h1>

            {camp ? (
              <div className="mt-4 max-w-2xl space-y-2 text-sm leading-relaxed text-zinc-400 md:text-base">
                <p>{camp.church_name}</p>
                {camp.theme && <p>Tema: {camp.theme}</p>}
              </div>
            ) : (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
                Ranking público das equipes do acampamento.
              </p>
            )}
          </div>

        </div>

        {loading ? (
          <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
            Carregando ranking...
          </div>
        ) : error ? (
          <div className="mt-8 border border-red-500/40 p-5" role="alert"><p>{error}</p><button type="button" className="record-action mt-4" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>
        ) : notFound ? (
          <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <h2 className="text-2xl font-bold">
              Ranking não encontrado ou indisponível
            </h2>

            <p className="mt-3 text-zinc-400">
              Confira o link com a organização do acampamento.
            </p>

          </div>
        ) : ranking.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <h2 className="text-2xl font-bold">Nenhuma equipe ativa ainda</h2>

            <p className="mt-3 text-zinc-400">
              As equipes ativas do acampamento aparecem aqui, mesmo sem participantes ou pontos.
            </p>
          </div>
        ) : (
          <>
            <div className="ranking-podium" aria-label="Pódio">
              {topThree.map((tribe, index) => (
                <article
                  key={tribe.id}
                  style={{ gridColumn: index === 0 ? 2 : index === 1 ? 1 : 3, gridRow: 1 }}
                  className={`podium-place podium-place-${index + 1} rounded-3xl border ${
                    index === 0
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xl font-bold text-yellow-500 md:text-3xl">
                      #{index + 1}
                    </span>

                    <div
                      className="podium-symbol flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{ backgroundColor: tribe.color }}
                    >
                      <EntitySymbol value={tribe.symbol} />
                    </div>
                  </div>

                  <h2 className="mt-3 line-clamp-3 text-sm font-bold md:line-clamp-2 md:text-xl" title={tribe.name}>
                    {tribe.name}
                  </h2>

                </article>
              ))}
            </div>

            <h2 className="mt-8 text-xl font-bold">Classificação completa</h2>
            <div className="mt-4 hidden overflow-x-auto rounded-3xl border border-zinc-800 bg-zinc-900 md:block">
              <table className="w-full border-collapse">
                <thead className="bg-zinc-950">
                  <tr className="text-left text-sm">
                    <th className="px-6 py-5">Posição</th>
                    <th className="px-6 py-5">Equipe</th>
                    <th className="px-6 py-5">Integrantes</th>
                    <th className="px-6 py-5">Pontos +</th>
                    <th className="px-6 py-5">Penalidades</th>
                    <th className="px-6 py-5 text-right">Saldo</th>
                  </tr>
                </thead>

                <tbody>
                  {ranking.map((tribe, index) => (
                    <tr
                      key={tribe.id}
                      className="border-t border-zinc-800 text-sm"
                    >
                      <td className="px-6 py-5 font-bold text-yellow-500">
                        #{index + 1}
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl"
                            style={{ backgroundColor: tribe.color }}
                          >
                            <EntitySymbol value={tribe.symbol} />
                          </div>

                          <span className="font-semibold">{tribe.name}</span>
                        </div>
                      </td>

                      <td className="px-6 py-5 text-zinc-300">
                        {tribe.participantsCount}
                      </td>

                      <td className="px-6 py-5 text-green-400">
                        +{tribe.positivePoints}
                      </td>

                      <td className="px-6 py-5 text-red-400">
                        -{tribe.penaltyPoints}
                      </td>

                      <td
                        className={`px-6 py-5 text-right text-2xl font-black ${getPointsColor(tribe.total, index)}`}
                      >
                        {tribe.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-2 md:hidden">
              {ranking.map((tribe, index) => (
                <article
                  key={tribe.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-sm font-bold text-yellow-500">
                        #{index + 1}
                      </span>

                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-lg"
                        style={{ backgroundColor: tribe.color }}
                      >
                        <EntitySymbol value={tribe.symbol} />
                      </div>

                      <h3 className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">{tribe.name}</h3>
                    </div>

                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-2 text-xs">
                    <div className="min-w-0">
                      <span className="block text-zinc-400">Pontos +</span>
                      <span className="text-right text-green-400">
                        +{tribe.positivePoints}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="block text-zinc-400">Penalidades</span>
                      <span className="text-right text-red-400">
                        -{tribe.penaltyPoints}
                      </span>
                    </div>
                    <div className="min-w-0 text-right"><span className="block text-zinc-400">Saldo</span><strong className={getPointsColor(tribe.total, index)}>{tribe.total}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

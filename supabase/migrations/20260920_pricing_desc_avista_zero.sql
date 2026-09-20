-- desconto à vista ainda não está definido: começa zerado e a pessoa preenche na cotação
update pricing_metrics set default_value = 0 where key = 'desc_avista';

import { useState, useMemo } from 'react'
import { scaleOrdinal, scaleLinear } from 'd3-scale'
import {
    useTheme,
    usePropertyAccessor,
    guessQuantizeColorScale,
    getLabelGenerator,
} from '@nivo/core'
import { useInheritedColor } from '@nivo/colors'

const computeX = (column, cellWidth, padding) => {
    return column * cellWidth + cellWidth * 0.5 + padding * column + padding
}
const computeY = (row, cellHeight, padding) => {
    return row * cellHeight + cellHeight * 0.5 + padding * row + padding
}

const isHoverTargetByType = {
    cell: (cell, current) => cell.xKey === current.xKey && cell.yKey === current.yKey,
    row: (cell, current) => cell.yKey === current.yKey,
    column: (cell, current) => cell.xKey === current.xKey,
    rowColumn: (cell, current) => cell.xKey === current.xKey || cell.yKey === current.yKey,
}

const computeCells = ({
    data,
    keys,
    getIndex,
    xScale,
    yScale,
    sizeScale,
    cellOpacity,
    cellWidth,
    cellHeight,
    colorScale,
    nanColor,
    getLabel,
    getLabelTextColor,
}) => {
    const cells = []
    data.forEach(datum => {
        keys.forEach(key => {
            const nvalue = typeof datum[key] === 'number' ? datum[key] : datum[key].value
            const label = getLabel(datum, key)
            const index = getIndex(datum)
            const sizeMultiplier = sizeScale ? sizeScale(nvalue) : 1
            const width = sizeMultiplier * cellWidth
            const height = sizeMultiplier * cellHeight

            const cell = {
                id: `${key}.${index}`,
                xKey: key,
                yKey: index,
                x: xScale(key),
                y: yScale(index),
                width,
                height,
                value: datum[key],
                label,
                color: isNaN(nvalue) ? nanColor : colorScale(nvalue),
                opacity: cellOpacity,
            }
            cell.labelTextColor = getLabelTextColor(cell)

            cells.push(cell)
        })
    })

    return cells
}

export const useHeatMap = ({
    data,
    keys,
    indexBy,
    minValue: _minValue = 'auto',
    maxValue: _maxValue = 'auto',
    width,
    height,
    padding,
    forceSquare,
    sizeVariation,
    colors,
    nanColor,
    cellOpacity,
    cellBorderColor,
    label,
    labelTextColor,
    hoverTarget,
    cellHoverOpacity,
    cellHoverOthersOpacity,
}) => {
    const [currentCellId, setCurrentCellId] = useState(null)

    const getIndex = usePropertyAccessor(indexBy)
    const indices = useMemo(() => data.map(getIndex), [data, getIndex])
    const getLabel = useMemo(() => getLabelGenerator(label), [label])

    const layoutConfig = useMemo(() => {
        const columns = keys.length
        const rows = data.length

        let cellWidth = Math.max((width - padding * (columns + 1)) / columns, 0)
        let cellHeight = Math.max((height - padding * (rows + 1)) / rows, 0)

        let offsetX = 0
        let offsetY = 0
        if (forceSquare === true) {
            const cellSize = Math.min(cellWidth, cellHeight)
            cellWidth = cellSize
            cellHeight = cellSize

            offsetX = (width - ((cellWidth + padding) * columns + padding)) / 2
            offsetY = (height - ((cellHeight + padding) * rows + padding)) / 2
        }

        return {
            cellWidth,
            cellHeight,
            offsetX,
            offsetY,
        }
    }, [data, keys, width, height, padding, forceSquare])

    const scales = useMemo(() => {
        return {
            x: scaleOrdinal(
                keys.map((key, i) => computeX(i, layoutConfig.cellWidth, padding))
            ).domain(keys),
            y: scaleOrdinal(
                indices.map((d, i) => computeY(i, layoutConfig.cellHeight, padding))
            ).domain(indices),
        }
    }, [indices, keys, layoutConfig, padding])

    const values = useMemo(() => {
        let minValue = _minValue
        let maxValue = _maxValue
        if (minValue === 'auto' || maxValue === 'auto') {
            const allValues = data.reduce(
                (acc, row) =>
                    acc.concat(
                        keys.map(key => (typeof row[key] === 'number' ? row[key] : row[key].value))
                    ),
                []
            )

            if (minValue === 'auto') minValue = Math.min(...allValues)
            if (maxValue === 'auto') maxValue = Math.max(...allValues)
        }

        return {
            min: Math.min(minValue, maxValue),
            max: Math.max(maxValue, minValue),
        }
    }, [data, keys, _minValue, _maxValue])

    const sizeScale = useMemo(() => {
        if (sizeVariation > 0) {
            return scaleLinear()
                .range([1 - sizeVariation, 1])
                .domain([values.min, values.max])
        }
    }, [sizeVariation, values])

    const colorScale = useMemo(
        () => guessQuantizeColorScale(colors).domain([values.min, values.max]),
        [colors, values]
    )
    const theme = useTheme()
    const getCellBorderColor = useInheritedColor(cellBorderColor, theme)
    const getLabelTextColor = useInheritedColor(labelTextColor, theme)

    const cells = useMemo(
        () =>
            computeCells({
                data,
                keys,
                getIndex,
                xScale: scales.x,
                yScale: scales.y,
                sizeScale,
                cellOpacity,
                cellWidth: layoutConfig.cellWidth,
                cellHeight: layoutConfig.cellHeight,
                colorScale,
                nanColor,
                getLabel,
                getLabelTextColor,
            }),
        [
            data,
            keys,
            getIndex,
            scales,
            sizeScale,
            cellOpacity,
            layoutConfig,
            colorScale,
            nanColor,
            getLabel,
            getLabelTextColor,
        ]
    )

    const cellsWithCurrent = useMemo(() => {
        if (currentCellId === null) return cells

        const isHoverTarget = isHoverTargetByType[hoverTarget]
        const currentCell = cells.find(cell => cell.id === currentCellId)

        return cells.map(cell => {
            const opacity = isHoverTarget(cell, currentCell)
                ? cellHoverOpacity
                : cellHoverOthersOpacity

            if (opacity === cell.opacity) return cell

            return {
                ...cell,
                opacity,
            }
        })
    }, [cells, currentCellId, hoverTarget, cellHoverOpacity, cellHoverOthersOpacity])

    return {
        cells: cellsWithCurrent,
        getIndex,
        xScale: scales.x,
        yScale: scales.y,
        ...layoutConfig,
        sizeScale,
        currentCellId,
        setCurrentCellId,
        colorScale,
        getCellBorderColor,
        getLabelTextColor,
    }
}

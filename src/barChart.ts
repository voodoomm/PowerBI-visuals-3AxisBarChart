module powerbi.extensibility.visual {
    /**
     * Interface for BarCharts viewmodel.
     *
     * @interface
     * @property {BarChartDataPoint[]} dataPoints - Set of data points the visual will render.
     * @property {number} dataMax                 - Maximum data value in the set of data points.
     */
    interface BarChartViewModel {
        dataPoints: BarChartDataPoint[];
        dataMax: number;
        dataMax2: number;
        settings: BarChartSettings;
    };

    /**
     * Interface for BarChart data points.
     *
     * @interface
     * @property {number} value             - Data value for point.
     * @property {string} category          - Corresponding category of data value.
     * @property {string} color             - Color corresponding to data point.
     * @property {ISelectionId} selectionId - Id assigned to data point for cross filtering
     *                                        and visual interaction.
     */
    interface BarChartDataPoint {
        value: PrimitiveValue;
        category: string;
        vaxis: number;
        color: string;
        selectionId: ISelectionId;
    };

    /**
     * Interface for BarChart settings.
     *
     * @interface
     * @property {{show:boolean}} enableAxis - Object property that allows axis to be enabled.
     */
    interface BarChartSettings {
        enableAxis: {
            show: boolean;
        };
        colorSelector: {
            color1: string;
            color2: string;
        };
        generalView: {
            opacity: number;
            y2trim: number;
        };
    }

    /**
     * Function that converts queried data into a view model that will be used by the visual.
     *
     * @function
     * @param {VisualUpdateOptions} options - Contains references to the size of the container
     *                                        and the dataView which contains all the data
     *                                        the visual had queried.
     * @param {IVisualHost} host            - Contains references to the host which contains services
     */
    function visualTransform(options: VisualUpdateOptions, host: IVisualHost): BarChartViewModel {
        let dataViews = options.dataViews;
        let defaultSettings: BarChartSettings = {
            enableAxis: {
                show: true,
            },
            colorSelector: {
                color1: host.colorPalette.getColor(1 + '').value,
                color2: host.colorPalette.getColor(2 + '').value
            },
            generalView: {
                opacity: 100,
                y2trim: 120
            }
        };
        let viewModel: BarChartViewModel = {
            dataPoints: [],
            dataMax: 0,
            dataMax2: 0,
            settings: <BarChartSettings>{}
        };

        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.categories[0].source
            || !dataViews[0].categorical.values)
            return viewModel;

        let categorical = dataViews[0].categorical;
        let category = categorical.categories[0];
        let dataValue = categorical.values[0];
        let dataValue2 = categorical.values[1];

        let barChartDataPoints: BarChartDataPoint[] = [];
        let dataMax: number;
        let dataMax2: number;

        let colorPalette: IColorPalette = host.colorPalette;
        let objects = dataViews[0].metadata.objects;
        let barChartSettings: BarChartSettings = {
            enableAxis: {
                show: getValue<boolean>(objects, 'enableAxis', 'show', defaultSettings.enableAxis.show),
            },
            colorSelector: {
                color1: getValue<Fill>(objects, 'colorSelector', 'fill', defaultSettings.colorSelector.color1).solid.color,
                color2: getValue<Fill>(objects, 'colorSelector', 'fill2', defaultSettings.colorSelector.color2).solid.color,
            },
            generalView: {
                opacity: getValue<number>(objects, 'generalView', 'opacity', defaultSettings.generalView.opacity),
                y2trim: getValue<number>(objects, 'generalView', 'y2trim', defaultSettings.generalView.y2trim),
            }
        };
        for (let i = 0, len = Math.max(category.values.length, dataValue.values.length); i < len; i++) {
            let defaultColor: Fill = {
                solid: {
                    color: colorPalette.getColor(category.values[i] + '').value
                }
            };

            barChartDataPoints.push({
                category: category.values[i] + '',
                value: dataValue.values[i],
                vaxis: 1,  //first axis
                color: barChartSettings.colorSelector.color1,  //colorPalette.getColor(1 + '').value,  //getCategoricalObjectValue<Fill>(category, i, 'colorSelector', 'fill', defaultColor).solid.color,
                selectionId: host.createSelectionIdBuilder()
                    .withCategory(category, i)
                    .createSelectionId()
            });
            barChartDataPoints.push({
                category: category.values[i] + '',
                value: dataValue2.values[i],
                vaxis: 2,  //second axis
                color: barChartSettings.colorSelector.color2,  //colorPalette.getColor(2 + '').value,  //getCategoricalObjectValue<Fill>(category, i, 'colorSelector', 'fill', defaultColor).solid.color,
                selectionId: host.createSelectionIdBuilder()
                    .withCategory(category, i) // + Math.max(category.values.length, dataValue.values.length))
                    .createSelectionId()
            });
        }
        dataMax = <number>dataValue.maxLocal;
        dataMax2 = <number>dataValue2.maxLocal;  // * 1.2;  //second axis

        return {
            dataPoints: barChartDataPoints,
            dataMax: dataMax,
            dataMax2: dataMax2,
            settings: barChartSettings,
        };
    }

    export class BarChart implements IVisual {
        private svg: d3.Selection<SVGElement>;
        private host: IVisualHost;
        private selectionManager: ISelectionManager;
        private barChartContainer: d3.Selection<SVGElement>;
        private barContainer: d3.Selection<SVGElement>;
        private xAxis: d3.Selection<SVGElement>;
        private yAxis: d3.Selection<SVGElement>;
        private yAxis2: d3.Selection<SVGElement>;
        private barDataPoints: BarChartDataPoint[];
        private barChartSettings: BarChartSettings;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private locale: string;

        static Config = {
            xScalePadding: 0.1,
            solidOpacity: 1,
            transparentOpacity: 0.5,
            margins: {
                top: 0,
                right: 0,
                bottom: 25,
                left: 30,
            },
            xAxisFontMultiplier: 0.02,
        };

        /**
         * Creates instance of BarChart. This method is only called once.
         *
         * @constructor
         * @param {VisualConstructorOptions} options - Contains references to the element that will
         *                                             contain the visual and a reference to the host
         *                                             which contains services.
         */
        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.selectionManager = options.host.createSelectionManager();
            this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);
            let svg = this.svg = d3.select(options.element)
                .append('svg')
                .classed('barChart', true);

            this.locale = options.host.locale;

            this.barContainer = svg.append('g')
                .classed('barContainer', true);

            this.xAxis = svg.append('g')
                .classed('xAxis', true);
            this.yAxis = svg.append('g')
                .classed('yAxis', true);
            this.yAxis2 = svg.append('g')
                .classed('yAxis', true);
        }

        /**
         * Updates the state of the visual. Every sequential databinding and resize will call update.
         *
         * @function
         * @param {VisualUpdateOptions} options - Contains references to the size of the container
         *                                        and the dataView which contains all the data
         *                                        the visual had queried.
         */
        public update(options: VisualUpdateOptions) {
            let viewModel: BarChartViewModel = visualTransform(options, this.host);
            let settings = this.barChartSettings = viewModel.settings;
            this.barDataPoints = viewModel.dataPoints;

            let width = options.viewport.width;
            let height = options.viewport.height;

            this.svg.attr({
                width: width,
                height: height
            });

            if (settings.enableAxis.show) {
                let margins = BarChart.Config.margins;
                height -= margins.bottom;
            }

            this.xAxis.style({
                'font-size': d3.min([height, width]) * BarChart.Config.xAxisFontMultiplier,
            });
            this.yAxis.style({
                'font-size': d3.min([height, width]) * BarChart.Config.xAxisFontMultiplier,
            });
            this.yAxis2.style({
                'font-size': d3.min([height, width]) * BarChart.Config.xAxisFontMultiplier,
            });

            let yScale = d3.scale.linear()
                .domain([0, viewModel.dataMax * (2 - (viewModel.settings.generalView.y2trim / 100))])
                .range([height, 0]);
            let yScale2 = d3.scale.linear()
                .domain([0, viewModel.dataMax2 * (viewModel.settings.generalView.y2trim / 100)])
                .range([height, 0]);

            let xScale = d3.scale.ordinal()
                .domain(viewModel.dataPoints.map(d => d.category))
                .rangeRoundBands([0, width], BarChart.Config.xScalePadding, 0.2);

            let xAxis = d3.svg.axis()
                .scale(xScale)
                .orient('bottom');

            this.xAxis.attr('transform', 'translate(0, ' + height + ')')
                .call(xAxis);

            let yAxis = d3.svg.axis()
                .scale(yScale)
                .tickSize(0)
                .orient('right');
            this.yAxis.attr('transform', 'translate(0, 0)')
                .call(yAxis);

            let yAxis2 = d3.svg.axis()
                .scale(yScale2)
                .tickSize(0)
                .orient('left');
            this.yAxis2.attr('transform', 'translate('+ width +', 0)')
                .call(yAxis2);

            let bars = this.barContainer.selectAll('.bar').data(viewModel.dataPoints);
            bars.enter()
                .append('rect')
                .classed('bar', true);

            bars.attr({
                width: d => xScale.rangeBand() / d.vaxis,
                height: d => height - ((d.vaxis - 1) * yScale2(<number>d.value)) - ((d.vaxis - 2) * -1 * yScale(<number>d.value)),
                y: d => ((d.vaxis - 1) * yScale2(<number>d.value)) + ((d.vaxis - 2) * -1 * yScale(<number>d.value)),
                x: d => xScale(d.category) + (xScale.rangeBand() / 4) * (d.vaxis -1),
                fill: d => d.color,
                'fill-opacity': viewModel.settings.generalView.opacity / 100
            });

            this.tooltipServiceWrapper.addTooltip(this.barContainer.selectAll('.bar'),
                (tooltipEvent: TooltipEventArgs<number>) => this.getTooltipData(tooltipEvent.data),
                (tooltipEvent: TooltipEventArgs<number>) => null);

            let selectionManager = this.selectionManager;
            let allowInteractions = this.host.allowInteractions;

            // This must be an anonymous function instead of a lambda because
            // d3 uses 'this' as the reference to the element that was clicked.
            bars.on('click', function(d) {
				// Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
                if (allowInteractions) {
                    selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
                        bars.attr({
                            'fill-opacity': ids.length > 0 ? BarChart.Config.transparentOpacity : BarChart.Config.solidOpacity
                        });

                        d3.select(this).attr({
                            'fill-opacity': BarChart.Config.solidOpacity
                        });
                    });

                    (<Event>d3.event).stopPropagation();
                }
            });

            bars.exit()
               .remove();
        }

        /**
         * Enumerates through the objects defined in the capabilities and adds the properties to the format pane
         *
         * @function
         * @param {EnumerateVisualObjectInstancesOptions} options - Map of defined objects
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            switch (objectName) {
                case 'enableAxis':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: this.barChartSettings.enableAxis.show,
                        },
                        selector: null
                    });
                    break;
                case 'colorSelector':
                    /*for (let barDataPoint of this.barDataPoints) {
                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: barDataPoint.category,
                            properties: {
                                fill: {
                                    solid: {
                                        color: barDataPoint.color
                                    }
                                }
                            },
                            selector: barDataPoint.selectionId
                        });
                    }*/
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: "Colors",
                        properties: {
                            fill: {
                                solid: {
                                    color: this.barChartSettings.colorSelector.color1
                                }
                            },
                            fill2: {
                                solid: {
                                    color: this.barChartSettings.colorSelector.color2
                                }
                            }
                        },
                        selector: null
                    });
                    
                    break;
                case 'generalView':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            opacity: this.barChartSettings.generalView.opacity,
                            y2trim: this.barChartSettings.generalView.y2trim,
                        },
                        validValues: {
                            opacity: {
                                numberRange: {
                                    min: 10,
                                    max: 100
                                }
                            },
                            y2trim: {
                                numberRange: {
                                    min: 50,
                                    max: 150
                                }
                            }
                        },
                        selector: null
                    });
                    break;
            };

            return objectEnumeration;
        }

        /**
         * Destroy runs when the visual is removed. Any cleanup that the visual needs to
         * do should be done here.
         *
         * @function
         */
        public destroy(): void {
            // Perform any cleanup tasks here
        }

        private getTooltipData(value: any): VisualTooltipDataItem[] {
            let language = getLocalizedString(this.locale, "LanguageKey");
            return [{
                displayName: value.category,
                value: value.value.toString(),
                color: value.color,
                header: ""  //language && "displayed language " + language
            }];
        }
    }
}
